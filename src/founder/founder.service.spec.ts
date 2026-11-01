import { parseFeed } from './founder.service';

describe('parseFeed', () => {
  it('reads an RSS feed (CDATA, entities), newest first as listed', () => {
    const xml = `<rss><channel><title>ayubi</title>
      <item><title><![CDATA[Why tarbiyah & excellence belong together]]></title><link>https://ayubi.blog/tarbiyah</link><pubDate>Mon, 26 Oct 2026 08:00:00 GMT</pubDate></item>
      <item><title>Systems over heroes &amp; slogans</title><link>https://ayubi.blog/systems</link><pubDate>Fri, 09 Oct 2026 08:00:00 GMT</pubDate></item>
      <item><title>Third</title><link>https://ayubi.blog/3</link></item>
      <item><title>Fourth</title><link>https://ayubi.blog/4</link></item>
    </channel></rss>`;
    expect(parseFeed(xml)).toEqual([
      { title: 'Why tarbiyah & excellence belong together', url: 'https://ayubi.blog/tarbiyah', date: '2026-10-26' },
      { title: 'Systems over heroes & slogans', url: 'https://ayubi.blog/systems', date: '2026-10-09' },
      { title: 'Third', url: 'https://ayubi.blog/3', date: null },
    ]);
  });

  it('reads an Atom feed', () => {
    const xml = `<feed><entry><title>Hello</title><link rel="alternate" href="https://ayubi.blog/hello"/><published>2026-09-01T00:00:00Z</published></entry></feed>`;
    expect(parseFeed(xml)).toEqual([{ title: 'Hello', url: 'https://ayubi.blog/hello', date: '2026-09-01' }]);
  });

  it('ignores anything that isn’t a feed', () => {
    expect(parseFeed('<html><body>Not a feed</body></html>')).toEqual([]);
  });
});
