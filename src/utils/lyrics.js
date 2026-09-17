/**
 * js_ydlp - High-performance 1:1 Vanilla JavaScript port of yt-dlp
 *
 * Copyright (c) 2026 Axel Caruso and js_ydlp contributors.
 * Derived from and inspired by yt-dlp (https://github.com/yt-dlp/yt-dlp).
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * ====================================================================
 * OPEN AI STATEMENT:
 * This project openly supports, embraces, and encourages the use of
 * Artificial Intelligence (AI) and AI-assisted tooling in design,
 * development, testing, and maintenance.
 * ====================================================================
 */

import { RequestDirector } from '../networking/RequestDirector.js';

/**
 * Service to search and fetch synchronized (.lrc) and plain text lyrics.
 * Prioritizes open lyrics databases (LRCLIB) and falls back to YouTube captions/transcripts.
 */
export class LyricsProvider {
  /**
   * @param {object} [options]
   * @param {RequestDirector} [options.director] - HTTP director for network requests.
   * @param {string} [options.lrclibUrl='https://lrclib.net'] - Base URL for LRCLIB API.
   */
  constructor(options = {}) {
    this.director = options.director || new RequestDirector();
    this.lrclibUrl = options.lrclibUrl || 'https://lrclib.net';
  }

  /**
   * Cleans title and artist strings by stripping common YouTube suffixes and tags.
   * E.g. "(Official Music Video)", "[NCS Release]", "(feat. ...)", etc.
   *
   * @param {string} str - Raw string.
   * @returns {string} Cleaned string.
   */
  cleanTrackName(str) {
    if (!str) return '';
    return str
      .replace(/\s*[\(\[](official\s*(music\s*)?video|audio|lyrics?|visualizer|ncs\s*release|remix|hd|4k|hq)[\)\]]/gi, '')
      .replace(/[\(\[]\s*feat\.?.*?[\]\)]/gi, '')
      .replace(/\|.*$/g, '')
      .replace(/_.*$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Fetches lyrics from LRCLIB (open, free, public REST API).
   *
   * @param {object} params
   * @param {string} params.artist - Artist name.
   * @param {string} params.title - Track/Song title.
   * @param {string} [params.album] - Album name.
   * @param {number} [params.duration] - Song duration in seconds.
   * @returns {Promise<{ plainLyrics: string|null, syncedLyrics: string|null, artist: string, title: string, album: string|null, instrumental: boolean, source: string }|null>}
   */
  async fetchFromLRCLIB({ artist, title, album, duration }) {
    const cleanArtist = this.cleanTrackName(artist);
    const cleanTitle = this.cleanTrackName(title);

    // 1. Try exact match lookup
    const getParams = new URLSearchParams();
    if (cleanArtist) getParams.set('artist_name', cleanArtist);
    if (cleanTitle) getParams.set('track_name', cleanTitle);
    if (album) getParams.set('album_name', album);
    if (duration) getParams.set('duration', Math.round(duration));

    const exactUrl = `${this.lrclibUrl}/api/get?${getParams.toString()}`;
    try {
      const res = await this.director.send(exactUrl, {
        headers: { 'User-Agent': 'js_ydlp/1.0 (+https://github.com/axelcaruso/js_ydlp)' }
      });

      if (res.ok) {
        const data = await res.json();
        if (data && (data.plainLyrics || data.syncedLyrics || data.instrumental)) {
          return {
            plainLyrics: data.plainLyrics || null,
            syncedLyrics: data.syncedLyrics || null,
            artist: data.artistName || artist,
            title: data.trackName || title,
            album: data.albumName || album || null,
            instrumental: Boolean(data.instrumental),
            source: 'lrclib'
          };
        }
      }
    } catch {}

    // 2. Fallback to fuzzy search query
    const searchQuery = `${cleanArtist} ${cleanTitle}`.trim();
    if (!searchQuery) return null;

    const searchUrl = `${this.lrclibUrl}/api/search?q=${encodeURIComponent(searchQuery)}`;
    try {
      const searchRes = await this.director.send(searchUrl, {
        headers: { 'User-Agent': 'js_ydlp/1.0 (+https://github.com/axelcaruso/js_ydlp)' }
      });

      if (searchRes.ok) {
        const items = await searchRes.json();
        if (Array.isArray(items) && items.length > 0) {
          // Pick the first result with lyrics
          const match = items.find((item) => item.plainLyrics || item.syncedLyrics) || items[0];
          if (match && (match.plainLyrics || match.syncedLyrics || match.instrumental)) {
            return {
              plainLyrics: match.plainLyrics || null,
              syncedLyrics: match.syncedLyrics || null,
              artist: match.artistName || artist,
              title: match.trackName || title,
              album: match.albumName || album || null,
              instrumental: Boolean(match.instrumental),
              source: 'lrclib'
            };
          }
        }
      }
    } catch {}

    return null;
  }

  /**
   * Fetches lyrics from YouTube caption/transcript tracks if available.
   *
   * @param {Array<object>} captionTracks - Array of caption track objects from YouTube Innertube.
   * @returns {Promise<{ plainLyrics: string, syncedLyrics: string, source: string }|null>}
   */
  async fetchFromYouTubeCaptions(captionTracks) {
    if (!Array.isArray(captionTracks) || captionTracks.length === 0) return null;

    // Prefer manual English or the first caption track
    const track = captionTracks.find((c) => c.languageCode === 'en' && c.kind !== 'asr')
      || captionTracks.find((c) => c.kind !== 'asr')
      || captionTracks[0];

    if (!track || !track.baseUrl) return null;

    try {
      const res = await this.director.send(`${track.baseUrl}&fmt=json3`);
      if (!res.ok) return null;

      const data = await res.json();
      if (!data || !Array.isArray(data.events)) return null;

      const lines = [];
      const syncedLines = [];

      for (const event of data.events) {
        if (!event.segs) continue;
        const text = event.segs.map((s) => s.utf8 || '').join('').trim();
        if (!text || text === '\n') continue;

        lines.push(text);

        const startMs = event.tStartMs || 0;
        const totalSec = Math.floor(startMs / 1000);
        const min = String(Math.floor(totalSec / 60)).padStart(2, '0');
        const sec = String(totalSec % 60).padStart(2, '0');
        const centis = String(Math.floor((startMs % 1000) / 10)).padStart(2, '0');
        syncedLines.push(`[${min}:${sec}.${centis}] ${text}`);
      }

      if (lines.length === 0) return null;

      return {
        plainLyrics: lines.join('\n'),
        syncedLyrics: syncedLines.join('\n'),
        source: 'youtube_captions'
      };
    } catch {
      return null;
    }
  }

  /**
   * Resolves lyrics for a given track, checking external database first, then YouTube captions.
   *
   * @param {object} info - Media info dictionary.
   * @param {object} [options]
   * @param {string} [options.artist] - Custom artist.
   * @param {string} [options.title] - Custom title.
   * @param {string} [options.album] - Custom album.
   * @returns {Promise<{ plainLyrics: string|null, syncedLyrics: string|null, artist: string, title: string, source: string }|null>}
   */
  async getLyrics(info = {}, options = {}) {
    let artist = options.artist || info.artist;
    let title = options.title || info.track;

    if (!artist && info.title && info.title.includes(' - ')) {
      const parts = info.title.split(' - ');
      artist = parts[0].trim();
      if (!title) {
        title = parts.slice(1).join(' - ').split('|')[0].trim();
      }
    }

    if (!artist) artist = info.uploader || info.channel || '';
    if (!title) title = info.title || '';

    // 1. Try LRCLIB external database
    const external = await this.fetchFromLRCLIB({
      artist,
      title,
      album: options.album || info.album,
      duration: info.duration
    });

    if (external && (external.plainLyrics || external.syncedLyrics)) {
      return external;
    }

    // 2. Fallback to YouTube captions
    if (info.captions) {
      const ytLyrics = await this.fetchFromYouTubeCaptions(info.captions);
      if (ytLyrics) {
        return {
          ...ytLyrics,
          artist,
          title,
          album: options.album || info.album || null
        };
      }
    }

    return null;
  }

  /**
   * Fetches rich track metadata (genre, release year, album, artist, title)
   * from public music databases (iTunes Search API) with video metadata fallbacks.
   *
   * @param {object} params
   * @param {string} params.artist - Artist name.
   * @param {string} params.title - Track title.
   * @param {object} [params.info={}] - Optional media info dict for fallbacks.
   * @returns {Promise<{ genre: string|null, year: string|null, releaseDate: string|null, album: string|null, artist: string, title: string, source: string }|null>}
   */
  async fetchMusicMetadata({ artist, title, info = {} }) {
    const cleanArtist = this.cleanTrackName(artist);
    const cleanTitle = this.cleanTrackName(title);
    const query = `${cleanArtist} ${cleanTitle}`.trim();

    if (!query) return null;

    // 1. Query iTunes Search API (free, official, accurate genre and release dates)
    try {
      const itunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=3`;
      const res = await this.director.send(itunesUrl, {
        headers: { 'User-Agent': 'js_ydlp/1.0 (+https://github.com/axelcaruso/js_ydlp)' }
      });

      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.results) && data.results.length > 0) {
          const item = data.results[0];
          const releaseDate = item.releaseDate || null;
          let year = null;
          if (releaseDate) {
            year = String(new Date(releaseDate).getUTCFullYear());
          }

          return {
            genre: item.primaryGenreName || null,
            album: item.collectionName || null,
            year,
            releaseDate,
            artist: item.artistName || artist,
            title: item.trackName || title,
            source: 'itunes'
          };
        }
      }
    } catch {}

    // 2. Fallback: Check YouTube category or keywords for music genre
    let fallbackGenre = null;
    if (info.category && info.category !== 'Music') {
      fallbackGenre = info.category;
    }
    if (!fallbackGenre && Array.isArray(info.keywords)) {
      const genreKeywords = [
        'electronic', 'dance', 'trap', 'future trap', 'hip hop', 'rap', 'rock',
        'pop', 'jazz', 'lo-fi', 'house', 'dubstep', 'ambient', 'indie', 'classical'
      ];
      for (const kw of info.keywords) {
        const kwLower = String(kw).toLowerCase();
        const found = genreKeywords.find((g) => kwLower.includes(g));
        if (found) {
          fallbackGenre = found.charAt(0).toUpperCase() + found.slice(1);
          break;
        }
      }
    }

    if (fallbackGenre) {
      return {
        genre: fallbackGenre,
        album: info.album || null,
        year: info.upload_date ? info.upload_date.slice(0, 4) : null,
        releaseDate: info.upload_date || null,
        artist,
        title,
        source: 'video_metadata'
      };
    }

    return null;
  }
}

export const MusicMetadataProvider = LyricsProvider;
