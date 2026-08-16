#!/usr/bin/env node
// Generates short sine-wave WAV files as stand-in "tracks" for the local
// Driftwood Radio test site, so the reader's audio player has something
// real to fetch and play without depending on network access or any
// third-party service. Pure Node, no dependencies: hand-writes a PCM WAV
// header, since that format is simple enough not to need a library.

import { writeFileSync } from 'node:fs';

const SAMPLE_RATE = 44100;

/**
 * @param {object} options
 * @param {number} options.freq Tone frequency in Hz
 * @param {number} options.seconds Duration
 * @returns {Buffer}
 */
function generateTone({ freq, seconds }) {
	const sampleCount = Math.floor(SAMPLE_RATE * seconds);
	const dataSize = sampleCount * 2; // 16-bit mono
	const buffer = Buffer.alloc(44 + dataSize);

	buffer.write('RIFF', 0);
	buffer.writeUInt32LE(36 + dataSize, 4);
	buffer.write('WAVE', 8);
	buffer.write('fmt ', 12);
	buffer.writeUInt32LE(16, 16); // fmt chunk size
	buffer.writeUInt16LE(1, 20); // PCM
	buffer.writeUInt16LE(1, 22); // mono
	buffer.writeUInt32LE(SAMPLE_RATE, 24);
	buffer.writeUInt32LE(SAMPLE_RATE * 2, 28); // byte rate
	buffer.writeUInt16LE(2, 32); // block align
	buffer.writeUInt16LE(16, 34); // bits per sample
	buffer.write('data', 36);
	buffer.writeUInt32LE(dataSize, 40);

	for (let i = 0; i < sampleCount; i++) {
		// Fade in/out over 0.1s so playback doesn't click at the edges.
		const t = i / SAMPLE_RATE;
		const fade = Math.min(1, t / 0.1, (seconds - t) / 0.1);
		const sample = Math.sin(2 * Math.PI * freq * t) * fade * 0.3;
		buffer.writeInt16LE(Math.round(sample * 32767), 44 + i * 2);
	}

	return buffer;
}

const outDir = new URL('../sites/driftwood-radio/', import.meta.url);

writeFileSync(new URL('harbor-light.wav', outDir), generateTone({ freq: 329.63, seconds: 6 }));
writeFileSync(new URL('static-tide.wav', outDir), generateTone({ freq: 220, seconds: 6 }));

console.log('Generated harbor-light.wav and static-tide.wav');
