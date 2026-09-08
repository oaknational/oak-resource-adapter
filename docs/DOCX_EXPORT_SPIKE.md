# DOCX export notes

These are some notes that will be useful to revisit once image data is available
from the extraction service.

## Initial Spike

The harness's **Exports** view selects a checked-in resource-document fixture and
posts its document to `POST /dev/exports/docx`. The API generates bytes in memory;
there are no storage writes, artifact records or background jobs. The browser
downloads the response. This is not a teacher-facing API contract.

## Images and network policy

`EXPORT_IMAGE_ALLOWED_ORIGINS` is a comma-separated set of exact HTTPS origins on
the API. Empty means no image fetches. Only configure origins whose ownership
and public DNS you trust: the allowlist is not a DNS-rebinding defence.

The loader rejects relative URLs, credentials, local/private literal addresses
and unsupported declared media types. Requests send no application credentials,
do not follow redirects, and disable caching. Response media type, PNG/JPEG
signature and intrinsic dimensions must match. This is not a full image decoder.
Images are scaled to fit without changing aspect ratio or enlarging them.

Each export deduplicates URLs and allows at most 20 fetches, five seconds per
fetch, 5 MiB per image and 20 MiB downloaded in total. Failed downloads consume
the budget too. Failures keep the document downloadable, with a shaded,
dashed-border “Image unavailable in this document” placeholder containing available
alternative text. Captions and credits remain below it. No external image
relationship is emitted.

The current fixtures' relative SVGs intentionally exercise this fallback. No
harness origin, fixture-file lookup or SVG rasteriser is part of the exporter.
`embedFigures: false` bypasses image loading entirely; tests inject image bytes
to exercise embedding without networking.
