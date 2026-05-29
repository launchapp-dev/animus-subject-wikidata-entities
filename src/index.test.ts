import { describe, expect, it } from "vitest";
import {
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
} from "./index";

const config = {
  apiUrl: "https://www.wikidata.org/w/api.php",
  search: "machine learning",
  language: "en",
  type: "item" as const,
  limit: 25,
};

const result = {
  id: "Q2539",
  title: "Q2539",
  pageid: 3452,
  repository: "wikidata",
  url: "//www.wikidata.org/wiki/Q2539",
  concepturi: "http://www.wikidata.org/entity/Q2539",
  label: "machine learning",
  description: "scientific study of algorithms and statistical models",
  aliases: ["statistical learning"],
  match: { type: "label", language: "en", text: "machine learning" },
};

const entity = {
  id: "Q2539",
  type: "item",
  labels: { en: { language: "en", value: "machine learning" } },
  descriptions: { en: { language: "en", value: "scientific study of algorithms and statistical models" } },
  aliases: { en: [{ language: "en", value: "statistical learning" }] },
  sitelinks: {
    enwiki: { site: "enwiki", title: "Machine learning", url: "https://en.wikipedia.org/wiki/Machine_learning" },
  },
};

describe("Wikidata entity helpers", () => {
  it("builds ids", () => {
    expect(entitySubjectId("Q2539")).toBe("wikidata.entity:Q2539");
    expect(parseEntitySubjectId("wikidata.entity:Q2539")).toBe("Q2539");
    expect(parseEntitySubjectId("p31")).toBe("P31");
  });

  it("maps search results to subjects", () => {
    const subject = subjectFromSearchResult(config, result, 0, "2026-05-29T15:00:00Z");
    expect(subject.id).toBe("wikidata.entity:Q2539");
    expect(subject.kind).toBe("wikidata.entity");
    expect(subject.status).toBe("done");
    expect(subject.native_status).toBe("item");
    expect(subject.priority).toBe(0);
    expect(subject.url).toBe("https://www.wikidata.org/wiki/Q2539");
    expect(subject.custom?.entity_id).toBe("Q2539");
  });

  it("maps get entities to subjects", () => {
    const subject = subjectFromEntity(config, entity, "2026-05-29T15:00:00Z");
    expect(subject.title).toBe("machine learning");
    expect(subject.description).toBe("scientific study of algorithms and statistical models");
    expect(subject.custom?.aliases).toEqual(["statistical learning"]);
    expect(subject.custom?.sitelinks).toHaveLength(1);
  });

  it("maps native status and priority", () => {
    expect(nativeStatus(result)).toBe("item");
    expect(nativeStatus({ id: "P31" })).toBe("property");
    expect(statusFromEntity(result)).toBe("done");
    expect(priorityFromSearchResult(result, 0)).toBe(0);
    expect(priorityFromSearchResult({ ...result, label: "other" }, 8)).toBe(2);
  });

  it("labels and filters entities", () => {
    expect(labelsFromSearchResult(config, result)).toEqual(["wikidata", "item", "language:en", "search:machine learning", "repo:wikidata", "match:label"]);
    expect(matchesConfiguredFilters({ ...config, localQuery: "statistical" }, result)).toBe(true);
    expect(matchesConfiguredFilters({ ...config, localQuery: "does-not-match" }, result)).toBe(false);
    expect(matchesFilters(config, result, { labels_all: ["wikidata", "match:label"] }, 0)).toBe(true);
  });

  it("normalizes canonical URLs", () => {
    expect(canonicalUrl("Q2539", "//www.wikidata.org/wiki/Q2539")).toBe("https://www.wikidata.org/wiki/Q2539");
    expect(canonicalUrl("Q2539")).toBe("https://www.wikidata.org/wiki/Q2539");
  });
});
