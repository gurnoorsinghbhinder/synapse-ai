package main

import (
	"bufio"
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"intervue/backend/internal/ai"
	"intervue/backend/internal/eventbus"
	"intervue/backend/internal/gateway"
	"intervue/backend/internal/orchestrator"
	"intervue/backend/internal/store"
	"intervue/backend/internal/transport"
	"intervue/backend/internal/workers"
)

func main() {
	loadDotEnv()

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	bus := eventbus.NewMemoryBus()
	repository := store.New()

	var aiClient ai.Client
	if os.Getenv("GEMINI_API_KEY") != "" || os.Getenv("GOOGLE_API_KEY") != "" {
		aiClient = ai.NewGeminiClient()
		slog.Info("using Gemini LLM client")
	} else {
		aiClient = ai.MockClient{}
		slog.Info("using mock AI client (set GEMINI_API_KEY for real LLM)")
	}

	orch := orchestrator.New(bus, repository, aiClient)
	workerRuntime := workers.NewRuntime(bus, repository, aiClient, orch)
	workerRuntime.Start(ctx)

	ws := transport.NewWebSocketHub(bus, bus)
	server := gateway.New(repository, orch, ws)

	port := getenv("PORT", "8080")
	httpServer := &http.Server{
		Addr:         ":" + port,
		Handler:      server,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 0,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		slog.Info("backend listening", "addr", httpServer.Addr)
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("server failed", "error", err)
			os.Exit(1)
		}
	}()

	<-ctx.Done()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = httpServer.Shutdown(shutdownCtx)
}

func getenv(key string, defaultValue string) string {
	value := os.Getenv(key)
	if value == "" {
		return defaultValue
	}
	return value
}

func loadDotEnv() {
	path := filepath.Join(".env")
	data, err := os.Open(path)
	if err != nil {
		return
	}
	defer data.Close()

	scanner := bufio.NewScanner(data)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		parts := strings.SplitN(line, "=", 2)
		if len(parts) != 2 {
			continue
		}
		key := strings.TrimSpace(parts[0])
		value := strings.TrimSpace(parts[1])
		if os.Getenv(key) == "" {
			os.Setenv(key, value)
		}
	}
}
