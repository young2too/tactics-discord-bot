"use client";

import { useEffect, useRef, useState } from "react";
import type { BattleLog, ChatMessage, PublicEffect } from "../game/types";

let audioContext: AudioContext | null = null;
function audio() { audioContext ??= new AudioContext(); if (audioContext.state === "suspended") void audioContext.resume(); return audioContext; }
function beep(from: number, to: number, duration: number, delay = 0, volume = .045, type: OscillatorType = "sine") {
  const context = audio(), oscillator = context.createOscillator(), gain = context.createGain(), start = context.currentTime + delay;
  oscillator.type = type; oscillator.frequency.setValueAtTime(from, start); oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, to), start + duration);
  gain.gain.setValueAtTime(volume, start); gain.gain.exponentialRampToValueAtTime(.0001, start + duration); oscillator.connect(gain).connect(context.destination); oscillator.start(start); oscillator.stop(start + duration);
}
function burst(duration = .12, volume = .07, delay = 0) {
  const context = audio(), buffer = context.createBuffer(1, context.sampleRate * duration, context.sampleRate), data = buffer.getChannelData(0);
  for (let index = 0; index < data.length; index++) data[index] = Math.random() * 2 - 1;
  const source = context.createBufferSource(), gain = context.createGain(), start = context.currentTime + delay; source.buffer = buffer; gain.gain.setValueAtTime(volume, start); gain.gain.exponentialRampToValueAtTime(.0001, start + duration); source.connect(gain).connect(context.destination); source.start(start);
}
function play(kind: "inspect" | "attack" | "death" | "miss" | "snipe" | "revenge" | "successor" | "command" | "proclamation") {
  if (kind === "inspect") { beep(520, 780, .12); beep(780, 1040, .16, .1, .035); }
  if (kind === "attack") { burst(); beep(170, 60, .2, 0, .075, "sawtooth"); }
  if (kind === "death") { beep(125, 34, .5, 0, .085, "sawtooth"); beep(68, 28, .7, .12, .06); }
  if (kind === "miss") { burst(.07, .035); beep(330, 95, .32, .07, .05, "triangle"); }
  if (kind === "snipe") { burst(.18, .12); beep(95, 30, .55, 0, .1, "square"); }
  if (kind === "revenge") { beep(190, 430, .18, 0, .065, "sawtooth"); burst(.2, .09, .14); beep(75, 28, .55, .16, .08, "square"); }
  if (kind === "successor") [330, 440, 554].forEach((frequency, index) => beep(frequency, frequency * 1.08, .35, index * .1, .035, "triangle"));
  if (kind === "command") { beep(220, 220, .12, 0, .05); beep(440, 440, .18, .12, .055, "square"); beep(660, 720, .24, .25, .045, "triangle"); }
  if (kind === "proclamation") { beep(880, 880, .16, 0, .04, "sine"); beep(1175, 1175, .3, .14, .045, "sine"); }
}

export function GameAudio({ logs, chats, effect }: { logs: BattleLog[]; chats: ChatMessage[]; effect: PublicEffect }) {
  const [muted, setMuted] = useState(false), [proclamation, setProclamation] = useState<ChatMessage | null>(null);
  const logCount = useRef(logs.length), chatCount = useRef(chats.length), effectKey = useRef("");
  useEffect(() => { const unlock = () => { if (!muted) audio(); }; window.addEventListener("pointerdown", unlock, { once: true }); return () => window.removeEventListener("pointerdown", unlock); }, [muted]);
  useEffect(() => {
    if (!effect) { effectKey.current = ""; return; } const key = `${effect.id}:${effect.type}`; if (key === effectKey.current) return; effectKey.current = key;
    if (!muted) play(effect.type === "inspect" || effect.type === "scan" ? "inspect" : "attack");
  }, [effect, muted]);
  useEffect(() => {
    if (logs.length <= logCount.current) { logCount.current = logs.length; return; } const text = logs.at(-1)?.text ?? ""; logCount.current = logs.length; if (muted) return;
    if (/저격명령.*성공|저격.*활성/.test(text)) play("command"); else if (/후계자.*지정/.test(text)) play("successor"); else if (/복수/.test(text)) play("revenge"); else if (/저격/.test(text)) play("snipe"); else if (/사망|처치|명중/.test(text)) play("death"); else if (/실패|빗나/.test(text)) play("miss");
  }, [logs, muted]);
  useEffect(() => {
    if (chats.length <= chatCount.current) { chatCount.current = chats.length; return; } const message = chats.at(-1); chatCount.current = chats.length;
    if (!message?.anonymous || !message.text.startsWith("[공문]")) return; setProclamation(message); if (!muted) play("proclamation");
    const timer = window.setTimeout(() => setProclamation((current) => current?.id === message.id ? null : current), 6500); return () => window.clearTimeout(timer);
  }, [chats, muted]);
  return <><button className="audio-toggle" onClick={() => setMuted((value) => !value)} aria-label={muted ? "효과음 켜기" : "효과음 끄기"}>{muted ? "🔇" : "🔊"}<span>{muted ? "음향 꺼짐" : "음향 켜짐"}</span></button>{proclamation && <button className="proclamation-banner" onClick={() => setProclamation(null)}><small>📜 익명 공문</small><strong>{proclamation.text.replace(/^\[공문\]\s*/, "")}</strong><span>터치하여 닫기</span></button>}</>;
}
