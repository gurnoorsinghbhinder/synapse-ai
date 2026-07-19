import type { InterviewSnapshot } from "./backend";

const CANDIDATE_KEY = "synapse.candidate_id";
const INTERVIEW_KEY = "synapse.interview_id";
const SNAPSHOT_KEY = "synapse.last_snapshot";

export function getCandidateId() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(CANDIDATE_KEY);
}

export function setCandidateId(candidateId: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(CANDIDATE_KEY, candidateId);
}

export function getInterviewId() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(INTERVIEW_KEY);
}

export function setInterviewId(interviewId: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(INTERVIEW_KEY, interviewId);
}

export function saveSnapshot(snapshot: InterviewSnapshot) {
  if (typeof window === "undefined") return;
  localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
}

export function loadSnapshot(): InterviewSnapshot | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(SNAPSHOT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as InterviewSnapshot;
  } catch {
    return null;
  }
}
