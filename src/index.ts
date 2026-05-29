import { definePlugin, PluginKind, type Subject, type SubjectBackend, type SubjectListParams, type SubjectStatus } from "@launchapp-dev/animus-plugin-sdk";

const NAME = "animus-subject-wikidata-entities";
const VERSION = "0.1.0";
const SUBJECT_KIND = "wikidata.entity";
const DEFAULT_API_URL = "https://www.wikidata.org/w/api.php";
const DEFAULT_SEARCH = "machine learning";
const DEFAULT_LANGUAGE = "en";

type WikidataEntityType = "item" | "property";

interface Config {
  apiUrl: string;
  search: string;
  language: string;
  type: WikidataEntityType;
  localQuery?: string;
  limit: number;
}

interface WikidataSearchMatch {
  type?: string;
  language?: string;
  text?: string;
}

interface WikidataSearchResult {
  id?: string;
  title?: string;
  pageid?: number;
  repository?: string;
  url?: string;
  concepturi?: string;
  label?: string;
  description?: string;
  aliases?: string[];
  match?: WikidataSearchMatch;
}

interface WikidataSearchResponse {
  success?: number;
  searchinfo?: { search?: string };
  search?: WikidataSearchResult[];
}

interface WikidataValue {
  language?: string;
  value?: string;
}

interface WikidataEntity {
  id?: string;
  type?: string;
  labels?: Record<string, WikidataValue>;
  descriptions?: Record<string, WikidataValue>;
  aliases?: Record<string, WikidataValue[]>;
  sitelinks?: Record<string, { site?: string; title?: string; url?: string }>;
}

interface WikidataGetResponse {
  success?: number;
  entities?: Record<string, WikidataEntity>;
}

function optionalEnv(name: string): string | undefined {
  const raw = process.env[name]?.trim();
  return raw === "" ? undefined : raw;
}

function normalizeBaseUrl(raw: string | undefined, fallback: string): string {
  return raw ?? fallback;
}

function readPositiveInt(raw: string | undefined, fallback: number, max: number): number {
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value < 1) return fallback;
  return Math.min(value, max);
}

function readType(raw: string | undefined): WikidataEntityType {
  const value = (raw ?? "item").toLowerCase();
  if (value === "item" || value === "property") return value;
  throw new Error(`WIKIDATA_TYPE must be item or property; got ${raw}`);
}

function readConfig(): Config {
  return {
    apiUrl: normalizeBaseUrl(optionalEnv("WIKIDATA_API_URL"), DEFAULT_API_URL),
    search: optionalEnv("WIKIDATA_SEARCH") ?? DEFAULT_SEARCH,
    language: optionalEnv("WIKIDATA_LANGUAGE") ?? DEFAULT_LANGUAGE,
    type: readType(optionalEnv("WIKIDATA_TYPE")),
    localQuery: optionalEnv("WIKIDATA_QUERY"),
    limit: readPositiveInt(optionalEnv("WIKIDATA_LIMIT"), 25, 50),
  };
}

function encodePart(value: string): string {
  return encodeURIComponent(value);
}

function decodePart(value: string): string {
  return decodeURIComponent(value);
}

function entitySubjectId(id: string): string {
  return `${SUBJECT_KIND}:${encodePart(id)}`;
}

function parseEntitySubjectId(id: string): string {
  const raw = id.startsWith(`${SUBJECT_KIND}:`) ? id.slice(`${SUBJECT_KIND}:`.length) : id;
  const parsed = decodePart(raw).trim().toUpperCase();
  if (!/^[PQ][1-9][0-9]*$/.test(parsed)) throw new Error(`expected id '${SUBJECT_KIND}:<Q-or-P-id>', got '${id}'`);
  return parsed;
}

function canonicalUrl(entityId: string, rawUrl?: string): string {
  if (rawUrl?.startsWith("//")) return `https:${rawUrl}`;
  if (rawUrl) return rawUrl;
  return `https://www.wikidata.org/wiki/${entityId}`;
}

function nativeStatus(result: WikidataSearchResult | WikidataEntity): string {
  if ("type" in result && result.type) return result.type;
  const id = result.id ?? "";
  return id.startsWith("P") ? "property" : "item";
}

function statusFromEntity(_result: WikidataSearchResult | WikidataEntity): SubjectStatus {
  return "done";
}

function priorityFromSearchResult(result: WikidataSearchResult, ordinal = 0): number {
  const label = result.label?.toLowerCase();
  const matchText = result.match?.text?.toLowerCase();
  if (label && matchText && label === matchText) return 0;
  if (ordinal < 3) return 1;
  if (ordinal < 10) return 2;
  return 3;
}

function labelsFromSearchResult(config: Config, result: WikidataSearchResult): string[] {
  const labels = new Set<string>(["wikidata", nativeStatus(result), `language:${config.language}`, `search:${config.search}`]);
  if (result.repository) labels.add(`repo:${result.repository}`);
  if (result.match?.type) labels.add(`match:${result.match.type}`);
  return [...labels];
}

function subjectFromSearchResult(config: Config, result: WikidataSearchResult, ordinal = 0, fetchedAt = new Date().toISOString()): Subject {
  const id = parseEntitySubjectId(result.id ?? result.title ?? "");
  return {
    id: entitySubjectId(id),
    kind: SUBJECT_KIND,
    title: result.label ?? id,
    description: result.description ?? `Wikidata ${nativeStatus(result)} ${id}`,
    status: statusFromEntity(result),
    created_at: fetchedAt,
    updated_at: fetchedAt,
    labels: labelsFromSearchResult(config, result),
    url: canonicalUrl(id, result.url),
    native_status: nativeStatus(result),
    priority: priorityFromSearchResult(result, ordinal),
    custom: {
      entity_id: id,
      title: result.title,
      pageid: result.pageid,
      repository: result.repository,
      concepturi: result.concepturi,
      label: result.label,
      description: result.description,
      aliases: result.aliases ?? [],
      match: result.match,
      ordinal,
      raw: result,
    },
  };
}

function subjectFromEntity(config: Config, entity: WikidataEntity, fetchedAt = new Date().toISOString()): Subject {
  const id = parseEntitySubjectId(entity.id ?? "");
  const label = entity.labels?.[config.language]?.value ?? entity.labels?.en?.value ?? id;
  const description = entity.descriptions?.[config.language]?.value ?? entity.descriptions?.en?.value ?? `Wikidata ${nativeStatus(entity)} ${id}`;
  const aliases = entity.aliases?.[config.language]?.map((alias) => alias.value).filter((value): value is string => Boolean(value)) ?? [];
  const sitelinks = Object.values(entity.sitelinks ?? {}).filter((link) => Boolean(link.url));
  return {
    id: entitySubjectId(id),
    kind: SUBJECT_KIND,
    title: label,
    description,
    status: statusFromEntity(entity),
    created_at: fetchedAt,
    updated_at: fetchedAt,
    labels: ["wikidata", nativeStatus(entity), `language:${config.language}`],
    url: canonicalUrl(id),
    native_status: nativeStatus(entity),
    priority: 2,
    custom: {
      entity_id: id,
      label,
      description,
      aliases,
      sitelinks,
      raw: entity,
    },
  };
}

function matchesConfiguredFilters(config: Config, result: WikidataSearchResult): boolean {
  if (!config.localQuery) return true;
  const needle = config.localQuery.toLowerCase();
  const haystack = [
    result.id,
    result.title,
    result.repository,
    result.label,
    result.description,
    result.concepturi,
    result.match?.type,
    result.match?.text,
    ...(result.aliases ?? []),
  ].join(" ").toLowerCase();
  return haystack.includes(needle);
}

function matchesFilters(config: Config, result: WikidataSearchResult, params: SubjectListParams, ordinal = 0): boolean {
  if (!matchesConfiguredFilters(config, result)) return false;
  const subject = subjectFromSearchResult(config, result, ordinal);
  if (params.status && params.status.length > 0 && !params.status.includes(subject.status)) return false;
  if (params.assignee && params.assignee.length > 0) return false;
  const labels = new Set(subject.labels ?? []);
  if (params.labels_all && !params.labels_all.every((label) => labels.has(label))) return false;
  if (params.labels_any && params.labels_any.length > 0 && !params.labels_any.some((label) => labels.has(label))) return false;
  if (params.updated_since && new Date(subject.updated_at) < new Date(params.updated_since)) return false;
  return true;
}

class WikidataEntitiesClient {
  constructor(private readonly config: Config) {}

  async requestJson<T>(query: Record<string, string | number | undefined>): Promise<T> {
    const url = new URL(this.config.apiUrl);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": `${NAME}/${VERSION} (https://github.com/launchapp-dev/${NAME})`,
      },
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`Wikidata API ${response.status} ${response.statusText}: ${text.slice(0, 500)}`);
    return JSON.parse(text) as T;
  }

  async list(): Promise<WikidataSearchResult[]> {
    const response = await this.requestJson<WikidataSearchResponse>({
      action: "wbsearchentities",
      format: "json",
      search: this.config.search,
      language: this.config.language,
      uselang: this.config.language,
      type: this.config.type,
      limit: this.config.limit,
    });
    return response.search ?? [];
  }

  async get(id: string): Promise<WikidataEntity> {
    const response = await this.requestJson<WikidataGetResponse>({
      action: "wbgetentities",
      format: "json",
      ids: id,
      languages: this.config.language,
      languagefallback: 1,
      props: "labels|descriptions|aliases|sitelinks/urls",
    });
    const entity = response.entities?.[id];
    if (!entity || entity.id === "-1") throw new Error(`Wikidata entity not found: ${id}`);
    return entity;
  }
}

function buildBackend(): SubjectBackend {
  let cached: { client: WikidataEntitiesClient; config: Config } | null = null;
  const runtime = (): { client: WikidataEntitiesClient; config: Config } => {
    if (!cached) {
      const config = readConfig();
      cached = { client: new WikidataEntitiesClient(config), config };
    }
    return cached;
  };
  return {
    async list(params) {
      const { client, config } = runtime();
      const results = await client.list();
      return {
        subjects: results.filter((result, index) => matchesFilters(config, result, params, index)).map((result, index) => subjectFromSearchResult(config, result, index)),
        next_cursor: null,
        fetched_at: new Date().toISOString(),
      };
    },
    async get(params) {
      const { client, config } = runtime();
      return subjectFromEntity(config, await client.get(parseEntitySubjectId(params.id)));
    },
    schema() {
      return {
        kinds: [SUBJECT_KIND],
        status_values: ["ready", "in-progress", "blocked", "done", "cancelled"],
        supports_watch: false,
        supports_create: false,
        supports_pagination: false,
        native_status_values: ["item", "property"],
        status_dispatch_hints: [
          { native_status: "item", status: "done" },
          { native_status: "property", status: "done" },
        ],
        custom_fields: ["entity_id", "title", "pageid", "repository", "concepturi", "label", "description", "aliases", "match", "ordinal", "sitelinks", "raw"],
      };
    },
    async health() {
      try {
        const { client } = runtime();
        await client.list();
        return { status: "healthy", uptime_ms: null, memory_usage_bytes: null, last_error: null };
      } catch (err) {
        return { status: "unhealthy", uptime_ms: null, memory_usage_bytes: null, last_error: String(err) };
      }
    },
  };
}

export {
  WikidataEntitiesClient,
  canonicalUrl,
  entitySubjectId,
  labelsFromSearchResult,
  matchesConfiguredFilters,
  matchesFilters,
  nativeStatus,
  parseEntitySubjectId,
  priorityFromSearchResult,
  statusFromEntity,
  subjectFromEntity,
  subjectFromSearchResult,
};

const plugin = definePlugin({
  kind: PluginKind.SubjectBackend,
  name: NAME,
  version: VERSION,
  description: "Wikidata entities subject backend plugin for Animus",
  subject_kinds: [SUBJECT_KIND],
  env_required: [
    { name: "WIKIDATA_SEARCH", description: `Optional entity search text. Defaults to ${DEFAULT_SEARCH}.`, required: false },
    { name: "WIKIDATA_LANGUAGE", description: `Optional result language. Defaults to ${DEFAULT_LANGUAGE}.`, required: false },
    { name: "WIKIDATA_TYPE", description: "Optional entity type: item or property. Defaults to item.", required: false },
    { name: "WIKIDATA_API_URL", description: `Optional Wikidata API URL. Defaults to ${DEFAULT_API_URL}.`, required: false },
    { name: "WIKIDATA_QUERY", description: "Optional local text query applied to entities after fetch.", required: false },
    { name: "WIKIDATA_LIMIT", description: "Optional maximum entity count from 1 to 50. Defaults to 25.", required: false },
  ],
  impl: buildBackend(),
});

function isDirectRun(): boolean {
  const entry = process.argv[1] ?? "";
  return entry.endsWith("index.cjs") || entry.endsWith("index.js") || entry.endsWith(NAME);
}

if (isDirectRun()) {
  plugin.run().catch((err) => {
    process.stderr.write(`[${NAME}] fatal: ${String(err)}\n`);
    process.exit(1);
  });
}
