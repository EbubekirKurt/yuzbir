import { describe, expect, it } from 'vitest';
import { Game } from '../shared/game';
import { buildResultMessage } from './discord';

function playedGame(mode: 'tekli' | 'esli') {
  const g = new Game({ mode, katlamali: true, esKatlama: false, hands: 11, turnSeconds: 45 }, ['A*li', 'Ayşe', '@everyone', 'Bot 1'], [false, false, false, true]);
  g.startHand();
  let guard = 0;
  while (g.phase !== 'gameOver' && guard++ < 20000) {
    if (g.phase === 'handEnd') g.nextHand();
    else g.autoPlay(g.turn);
  }
  return g;
}

describe('Discord sonuç mesajı', () => {
  it('11 ellik oyunda Discord sınırlarını aşmaz, kimseyi etiketlemez', () => {
    const g = playedGame('tekli');
    const msg = buildResultMessage(
      {
        tableName: 'Uzun bir masa adı',
        settings: g.settings,
        players: g.names.map((name, i) => ({ name, isBot: g.bots[i] })),
        history: g.history,
        totals: g.totals(),
        startedAt: new Date(Date.now() - 3600_000),
        finishedAt: new Date(),
      },
      'https://example.com',
    );
    const embed = msg.embeds[0] as { title: string; description: string; fields: { name: string; value: string }[] };
    expect(msg.allowed_mentions.parse).toEqual([]);
    expect(embed.title.length).toBeLessThanOrEqual(256);
    for (const f of embed.fields) expect(f.value.length).toBeLessThanOrEqual(1024);
    const total = embed.title.length + embed.description.length + embed.fields.reduce((n, f) => n + f.name.length + f.value.length, 0);
    expect(total).toBeLessThan(6000);
    // Markdown kaçışı: "A*li" kalın yazıyı bozmasın
    expect(embed.fields[0].value).toContain('A\\*li');
    expect(embed.fields.map((f) => f.name)).toContain('El el puanlar');
  });

  it('eşli modda takım sonucunu yazar', () => {
    const g = playedGame('esli');
    const msg = buildResultMessage({
      tableName: 'Eşli',
      settings: g.settings,
      players: g.names.map((name, i) => ({ name, isBot: g.bots[i] })),
      history: g.history,
      totals: g.totals(),
      startedAt: null,
      finishedAt: new Date(),
    });
    const embed = msg.embeds[0] as { description: string; fields: { name: string }[] };
    expect(embed.fields.map((f) => f.name)).toContain('Takımlar');
    expect(embed.description).toMatch(/takım|Berabere/);
  });
});

describe('puan tablosu görüntüsü', () => {
  it('PNG üretir, eşli ve tekli', async () => {
    const { renderResultImage } = await import('./resultImage');
    for (const mode of ['tekli', 'esli'] as const) {
      const g = playedGame(mode);
      const png = await renderResultImage({
        tableName: 'Şeker Ğ İ masası',
        settings: g.settings,
        players: g.names.map((name, i) => ({ name, isBot: g.bots[i] })),
        history: g.history,
        totals: g.totals(),
        startedAt: null,
        finishedAt: new Date(),
      });
      expect(png.subarray(1, 4).toString()).toBe('PNG');
      expect(png.length).toBeGreaterThan(20_000);
    }
  }, 30_000);

  it('görüntülü mesajda tablo metni yerine resim eki kullanılır', () => {
    const g = playedGame('tekli');
    const msg = buildResultMessage(
      { tableName: 'X', settings: g.settings, players: g.names.map((name, i) => ({ name, isBot: g.bots[i] })), history: g.history, totals: g.totals(), startedAt: null, finishedAt: new Date() },
      undefined,
      true,
    );
    const embed = msg.embeds[0] as { image?: { url: string }; fields: { name: string }[] };
    expect(embed.image?.url).toBe('attachment://puan-tablosu.png');
    expect(embed.fields.map((f) => f.name)).not.toContain('El el puanlar');
  });
});
