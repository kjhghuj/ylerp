import type {DatabaseSync} from 'node:sqlite';
import {nowIso} from './db';

type Shop = {id: number; shop_id: string; name: string; account_key: string};
type Site = {id: number; code: string; name: string; timezone: string; shops: Shop[]};

/** Only ERP-bound shops are registered; no demo sites, passwords or browser profiles. */
export class SiteRegistry {
  constructor(private db: DatabaseSync) {}

  sitesForMode(mode: string): Site[] {
    const sites = this.db.prepare('SELECT id,code,name,timezone FROM sites WHERE mode=?').all(mode) as Omit<Site, 'shops'>[];
    return sites.map(site => ({...site, shops: this.db.prepare('SELECT id,shop_id,name,account_key FROM shops WHERE site_id=?').all(site.id) as Shop[]}));
  }

  findShop(mode: string, site: string, shopId: string) {
    const found = this.sitesForMode(mode).find(row => row.code === site);
    const shop = found?.shops.find(row => row.shop_id === shopId);
    return found && shop ? {site: found, shop} : undefined;
  }

  createSite(input: {mode: string; code: string; name: string; timezone: string}) {
    const now = nowIso();
    const row = this.db.prepare('INSERT INTO sites(mode,code,name,timezone,created_at,updated_at) VALUES(?,?,?,?,?,?)')
      .run(input.mode, input.code, input.name, input.timezone, now, now);
    return {id: Number(row.lastInsertRowid)};
  }

  createShop(siteId: number, input: {shopId: string; name: string; accountKey: string}) {
    const now = nowIso();
    const row = this.db.prepare('INSERT INTO shops(site_id,shop_id,name,account_key,created_at,updated_at) VALUES(?,?,?,?,?,?)')
      .run(siteId, input.shopId, input.name, input.accountKey, now, now);
    return {id: Number(row.lastInsertRowid)};
  }
}
