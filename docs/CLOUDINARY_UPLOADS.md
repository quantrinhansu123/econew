# Cloudinary upload policy

All new image uploads go through `server/src/uploads/storage.service.ts`. The server is the source of truth: it checks the byte signature, declared MIME/extension, pixel count and input size, then auto-rotates, strips metadata, resizes to at most 2400 px and stores a WebP capped at 3 MB. PDFs and Excel files stay in their original format and are checked by signature.

The signed upload uses a deterministic `public_id` derived from the normalized file SHA-256 and sends `overwrite=false`/`unique_filename=false`. This prevents a retry of the same normalized bytes from overwriting or creating a random duplicate. In-flight requests with the same folder and digest share one promise. Existing URL-only records remain compatible; there is no destructive asset cleanup because the schema does not retain Cloudinary `public_id` values.

Before each upload, `CloudinaryUsageService` reads the Cloudinary Usage API with a server-only Basic-auth request. A successful response is cached for five minutes and concurrent refreshes are coalesced. The default app guard stops new uploads at 24 of 25 configured credits, applies a per-instance rate/concurrency limit, and fails closed with a standard HTTP error when usage cannot be verified. These are safety guards, not a guarantee: Cloudinary credits also include storage, transformations and delivered image bandwidth, and other services or other app instances can consume the account between checks.

Defaults can be overridden with the `CLOUDINARY_*` variables in `server/.env.example`; never expose the API secret in client code or logs. Do not run upload/delete tests against production.

Official references:

- [Cloudinary billing and credits](https://cloudinary.com/documentation/billing_and_plans)
- [Cloudinary Admin API usage](https://cloudinary.com/documentation/admin_api#usage)
- [Cloudinary upload API](https://cloudinary.com/documentation/upload_images)
- [Cloudinary image optimization](https://cloudinary.com/documentation/image_optimization)
- [Cloudinary image format support](https://cloudinary.com/documentation/image_transformations#supported_image_formats)
