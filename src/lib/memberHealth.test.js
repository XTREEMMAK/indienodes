import { describe, expect, it, vi } from 'vitest';
import {
	applyFailureHistory,
	collectMemberLinks,
	groupLinksByUrl,
	hasVerificationToken,
	isPublicIpAddress,
	probeLink,
	validateExternalUrl
} from '../../scripts/member-health.js';

const publicLookup = async () => [{ address: '93.184.216.34', family: 4 }];

function grouped(url = 'https://creator.example/work') {
	return groupLinksByUrl([
		collectMemberLinks(
			{
				id: 'audio-example',
				source_url: url,
				verification_token: 'token-123'
			},
			'audio-example.json'
		)
	])[0];
}

describe('member health link collection', () => {
	it('collects every URL-bearing member field with its JSON path', () => {
		const links = collectMemberLinks(
			{
				id: 'comic-example',
				source_url: 'https://creator.example',
				thumb_url: 'https://cdn.example/thumb.jpg',
				preview_url: 'https://cdn.example/preview.mp4',
				tracks: [{ media_url: 'https://cdn.example/track.mp3' }],
				pages: [{ image_url: 'https://cdn.example/page.png' }]
			},
			'comic-example.json'
		);
		expect(links.map(({ field }) => field)).toEqual([
			'source_url',
			'thumb_url',
			'preview_url',
			'tracks[0].media_url',
			'pages[0].image_url'
		]);
	});

	it('deduplicates a URL while retaining every reference', () => {
		const links = groupLinksByUrl([
			collectMemberLinks(
				{
					id: 'audio-example',
					source_url: 'https://creator.example/same',
					thumb_url: 'https://creator.example/same'
				},
				'audio-example.json'
			)
		]);
		expect(links).toHaveLength(1);
		expect(links[0].references).toHaveLength(2);
	});
});

describe('member health URL safety', () => {
	it('blocks private and reserved addresses', () => {
		expect(isPublicIpAddress('127.0.0.1')).toBe(false);
		expect(isPublicIpAddress('169.254.169.254')).toBe(false);
		expect(isPublicIpAddress('10.2.3.4')).toBe(false);
		expect(isPublicIpAddress('::1')).toBe(false);
		expect(isPublicIpAddress('fd00::1')).toBe(false);
		expect(isPublicIpAddress('93.184.216.34')).toBe(true);
	});

	it('handles bracketed IPv6 literals without bypassing private-address checks', async () => {
		await expect(validateExternalUrl('http://[::1]')).rejects.toMatchObject({
			code: 'unsafe_url'
		});
		await expect(validateExternalUrl('https://[2606:4700:4700::1111]')).resolves.toBeInstanceOf(
			URL
		);
	});

	it('checks DNS and rejects a hostname with a private answer', async () => {
		const privateLookup = vi.fn(async () => [{ address: '192.168.1.5', family: 4 }]);
		await expect(
			validateExternalUrl('https://creator.example', privateLookup)
		).rejects.toMatchObject({
			code: 'unsafe_url'
		});
		expect(privateLookup).toHaveBeenCalledOnce();
	});
});

describe('member health probing', () => {
	it('uses a ranged GET and treats 2xx as healthy', async () => {
		const fetchImpl = vi.fn(async (_url, options) => {
			expect(options.headers.Range).toBe('bytes=0-0');
			return new Response(new Uint8Array([1]), { status: 206 });
		});
		const result = await probeLink(grouped(), { fetchImpl, lookupImpl: publicLookup });
		expect(result).toMatchObject({ outcome: 'healthy', reason: 'ok', statusCode: 206 });
		expect(fetchImpl).toHaveBeenCalledOnce();
	});

	it.each([404, 410])('treats HTTP %s as definitely broken', async (status) => {
		const result = await probeLink(grouped(), {
			fetchImpl: vi.fn(async () => new Response('', { status })),
			lookupImpl: publicLookup
		});
		expect(result).toMatchObject({
			outcome: 'broken',
			reason: 'http_' + status,
			statusCode: status
		});
	});

	it('keeps rate limits and server failures as warnings', async () => {
		const rateLimited = await probeLink(grouped(), {
			fetchImpl: vi.fn(async () => new Response('', { status: 429 })),
			lookupImpl: publicLookup
		});
		const serverError = await probeLink(grouped(), {
			fetchImpl: vi.fn(async () => new Response('', { status: 503 })),
			lookupImpl: publicLookup
		});
		expect(rateLimited).toMatchObject({ outcome: 'warning', reason: 'http_429' });
		expect(serverError).toMatchObject({ outcome: 'warning', reason: 'http_503' });
	});

	it('validates a redirect target before following it', async () => {
		const fetchImpl = vi.fn(
			async () =>
				new Response('', { status: 302, headers: { location: 'http://127.0.0.1/private' } })
		);
		const result = await probeLink(grouped(), { fetchImpl, lookupImpl: publicLookup });
		expect(result).toMatchObject({ outcome: 'warning', reason: 'unsafe_url' });
		expect(fetchImpl).toHaveBeenCalledOnce();
	});

	it('can check the verification meta tag recognized by intake', async () => {
		const fetchImpl = vi.fn(
			async () =>
				new Response('<html><meta content="token-123" name="indienode-verification"></html>', {
					status: 200
				})
		);
		const result = await probeLink(grouped(), {
			checkTokens: true,
			fetchImpl,
			lookupImpl: publicLookup
		});
		expect(result).toMatchObject({ outcome: 'healthy', reason: 'ok' });
		expect(
			hasVerificationToken('<meta name="indienode-verification" content="wrong">', 'token-123')
		).toBe(false);
	});
});

describe('member health failure history', () => {
	it('alerts after the configured number of consecutive definite failures', () => {
		const broken = [
			{ url: 'https://creator.example/missing', outcome: 'broken', reason: 'http_404' }
		];
		const first = applyFailureHistory(broken, {}, 3, {
			now: new Date('2026-08-20T00:00:00Z')
		});
		const second = applyFailureHistory(broken, first.state, 3, {
			now: new Date('2026-08-21T00:00:00Z')
		});
		const third = applyFailureHistory(broken, second.state, 3, {
			now: new Date('2026-08-22T00:00:00Z')
		});
		expect(first.results[0]).toMatchObject({ consecutiveFailures: 1, alert: false });
		expect(second.results[0]).toMatchObject({ consecutiveFailures: 2, alert: false });
		expect(third.results[0]).toMatchObject({ consecutiveFailures: 3, alert: true });
	});

	it('resets a broken streak when the next result is uncertain', () => {
		const state = {
			version: 1,
			failures: {
				'https://creator.example/missing': {
					count: 2,
					reason: 'http_404',
					lastChecked: '2026-08-21T00:00:00Z'
				}
			}
		};
		const warning = [
			{ url: 'https://creator.example/missing', outcome: 'warning', reason: 'timeout' }
		];
		const next = applyFailureHistory(warning, state, 3);
		expect(next.results[0]).toMatchObject({ consecutiveFailures: 0, alert: false });
		expect(next.state.failures).toEqual({});
	});
});
