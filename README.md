# animus-subject-wikidata-entities

Animus subject backend for Wikidata entities.

The plugin uses Wikidata's MediaWiki Action API to search entities with `wbsearchentities` and fetch specific entities with `wbgetentities`.

## Configuration

All settings are optional.

| Environment variable | Description |
| --- | --- |
| `WIKIDATA_SEARCH` | Entity search text. Defaults to `machine learning`. |
| `WIKIDATA_LANGUAGE` | Result language. Defaults to `en`. |
| `WIKIDATA_TYPE` | Entity type: `item` or `property`. Defaults to `item`. |
| `WIKIDATA_API_URL` | API URL. Defaults to `https://www.wikidata.org/w/api.php`. |
| `WIKIDATA_QUERY` | Local text query applied after fetch. |
| `WIKIDATA_LIMIT` | Maximum entities to fetch, 1-50. Defaults to `25`. |

## Development

```bash
npm ci
npm run typecheck
npm test
npm run build
npm run manifest
```

## Install

```bash
animus plugin install launchapp-dev/animus-subject-wikidata-entities
```
