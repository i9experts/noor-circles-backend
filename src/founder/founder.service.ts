import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { FounderProfile, FounderProfileDocument } from './founder.schema';
import { FOUNDER_DEFAULTS, FounderContent } from './founder.content';
import { UpdateFounderDto } from './founder.dto';

export interface BlogPost { title: string; url: string; date: string | null }

const POSTS_TTL = 6 * 3600_000;
const POSTS_RETRY = 30 * 60_000;

const decode = (s: string) => s
  .replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, '$1')
  .replace(/<[^>]+>/g, '')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, '\'')
  .replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n)))
  .trim();

/** The newest posts from an RSS or Atom feed. */
export function parseFeed(xml: string, limit = 3): BlogPost[] {
  const tag = (block: string, name: string) => block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'))?.[1] ?? '';
  const items = [...xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)].map((m) => m[0]);
  const entries = items.length ? [] : [...xml.matchAll(/<entry[\s>][\s\S]*?<\/entry>/gi)].map((m) => m[0]);
  const posts = items.length
    ? items.map((b) => ({ title: decode(tag(b, 'title')), url: decode(tag(b, 'link')), raw: tag(b, 'pubDate') }))
    : entries.map((b) => ({
      title: decode(tag(b, 'title')),
      url: b.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)/i)?.[1] ?? b.match(/<link[^>]*href=["']([^"']+)/i)?.[1] ?? '',
      raw: tag(b, 'published') || tag(b, 'updated'),
    }));
  return posts
    .filter((p) => p.title && /^https?:\/\//.test(p.url))
    .slice(0, limit)
    .map((p) => {
      const d = new Date(decode(p.raw));
      return { title: p.title, url: p.url, date: Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10) };
    });
}

@Injectable()
export class FounderService {
  private readonly logger = new Logger(FounderService.name);
  private posts: { url: string; at: number; ttl: number; list: BlogPost[] } | null = null;

  constructor(@InjectModel(FounderProfile.name) private readonly model: Model<FounderProfileDocument>) {}

  async get(): Promise<FounderContent & { updatedAt: Date | null }> {
    const doc = await this.model.findOne({ key: 'founder' }).lean();
    return { ...FOUNDER_DEFAULTS, ...(doc?.content as Partial<FounderContent> ?? {}), updatedAt: (doc as any)?.updatedAt ?? null };
  }

  async update(dto: UpdateFounderDto, adminId: string) {
    const doc = await this.model.findOne({ key: 'founder' }).lean();
    const content = { ...(doc?.content ?? {}) } as Record<string, unknown>;
    for (const [k, v] of Object.entries(dto)) if (v !== undefined) content[k] = typeof v === 'string' ? v.trim() : v;
    await this.model.updateOne({ key: 'founder' }, { $set: { content, updatedBy: new Types.ObjectId(adminId) } }, { upsert: true });
    this.posts = null;
    return { message: 'Founder profile saved.', profile: await this.get() };
  }

  /** Restores the approved text (an admin's changes are dropped). */
  async reset(adminId: string) {
    await this.model.updateOne({ key: 'founder' }, { $set: { content: {}, updatedBy: new Types.ObjectId(adminId) } }, { upsert: true });
    return { message: 'Founder profile restored to the original text.', profile: await this.get() };
  }

  /** The 3 newest blog posts (cached for 6 hours; an empty list if the feed can't be read). */
  async latestPosts(): Promise<BlogPost[]> {
    const { blogUrl } = await this.get();
    if (!blogUrl) return [];
    if (this.posts && this.posts.url === blogUrl && Date.now() - this.posts.at < this.posts.ttl) return this.posts.list;
    const base = blogUrl.replace(/\/$/, '');
    let list: BlogPost[] = [];
    for (const feed of [`${base}/feed`, `${base}/rss.xml`, `${base}/feed.xml`, `${base}/atom.xml`]) {
      try {
        const res = await fetch(feed, { signal: AbortSignal.timeout(6000), headers: { 'User-Agent': 'NoorCircles/1.0' } });
        if (!res.ok) continue;
        list = parseFeed(await res.text());
        if (list.length) break;
      } catch (err) {
        this.logger.debug(`Blog feed ${feed}: ${(err as Error).message}`);
      }
    }
    this.posts = { url: blogUrl, at: Date.now(), ttl: list.length ? POSTS_TTL : POSTS_RETRY, list };
    return list;
  }
}
