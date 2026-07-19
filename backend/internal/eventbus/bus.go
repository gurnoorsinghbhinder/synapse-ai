package eventbus

import (
	"context"
	"sync"

	"intervue/backend/shared/events"
)

type Bus interface {
	Publish(context.Context, events.Event)
	Subscribe(context.Context, string, ...events.Topic) <-chan events.Event
}

type MemoryBus struct {
	mu          sync.RWMutex
	subscribers map[string]subscription
	history     []events.Event
}

type subscription struct {
	topics map[events.Topic]bool
	ch     chan events.Event
}

func NewMemoryBus() *MemoryBus {
	return &MemoryBus{
		subscribers: make(map[string]subscription),
		history:     make([]events.Event, 0, 256),
	}
}

func (b *MemoryBus) Publish(ctx context.Context, event events.Event) {
	b.mu.Lock()
	b.history = append(b.history, event)
	subscribers := make([]subscription, 0, len(b.subscribers))
	for _, sub := range b.subscribers {
		if sub.topics[event.Topic] {
			subscribers = append(subscribers, sub)
		}
	}
	b.mu.Unlock()

	for _, sub := range subscribers {
		select {
		case sub.ch <- event:
		case <-ctx.Done():
			return
		default:
		}
	}
}

func (b *MemoryBus) Subscribe(ctx context.Context, name string, topics ...events.Topic) <-chan events.Event {
	ch := make(chan events.Event, 128)
	topicSet := make(map[events.Topic]bool, len(topics))
	for _, topic := range topics {
		topicSet[topic] = true
	}

	b.mu.Lock()
	b.subscribers[name] = subscription{topics: topicSet, ch: ch}
	b.mu.Unlock()

	go func() {
		<-ctx.Done()
		b.mu.Lock()
		delete(b.subscribers, name)
		b.mu.Unlock()
		close(ch)
	}()

	return ch
}

func (b *MemoryBus) History(interviewID string) []events.Event {
	b.mu.RLock()
	defer b.mu.RUnlock()

	out := make([]events.Event, 0, len(b.history))
	for _, event := range b.history {
		if interviewID == "" || event.InterviewID == interviewID {
			out = append(out, event)
		}
	}

	return out
}
