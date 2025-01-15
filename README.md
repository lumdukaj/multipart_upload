````markdown
# VpUploader

VpUploader is a robust JavaScript package built on top of [Uppy](https://uppy.io) for managing file uploads, specifically designed for handling multipart uploads to AWS S3. It provides configurable options, event hooks, and seamless integration with custom presigned URL endpoints.

---

## Features

- **Configurable Chunk Size**: Optimize uploads for large files with customizable chunk sizes.
- **Event Hooks**: Handle progress, success, errors, and multipart upload completion.
- **Uppy Integration**: Extends Uppy with custom AWS S3 multipart upload logic.
- **File Type Restrictions**: Specify allowed file types for uploads.
- **Presigned URL Support**: Easily integrate with APIs providing presigned URLs for secure uploads.

---

## Installation

Install the package using npm:

```bash
npm install vpuploader
```
````

---

## Usage

### Import and Initialize

```javascript
import VpUploader from "vpuploader";

const uploader = new VpUploader({
	chunkSize: 50 * 1024 * 1024, // 50 MiB
	debug: true,
	allowedFileTypes: ["video/*"],
});
```

### Event Hooks

Use the `.use()` method to register callbacks for key events:

```javascript
uploader.use({
	onMultipartComplete: (details) => {
		console.log("Multipart upload completed:", details);
	},
	onProgress: (progress) => {
		console.log("Upload progress:", progress);
	},
	onSuccess: (details) => {
		console.log("Upload successful:", details);
	},
	onError: (error) => {
		console.error("Upload error:", error);
	},
});
```

### Upload a File

To upload a file, provide the file object and details fetched from your presigned URL API:

```javascript
uploader.upload(file, {
	requestKey: "<REQUEST_KEY>",
	uploadId: "<UPLOAD_ID>",
	presignedUrls: ["<PRESIGNED_URL_PART_1>", "<PRESIGNED_URL_PART_2>"],
});
```

---

## Configuration Options

| Option             | Type      | Default Value             | Description                              |
| ------------------ | --------- | ------------------------- | ---------------------------------------- |
| `chunkSize`        | `number`  | `50 * 1024 * 1024` (50MB) | Size of each chunk for multipart uploads |
| `debug`            | `boolean` | `true`                    | Enable debug logging                     |
| `allowedFileTypes` | `array`   | `["video/*"]`             | Restrict uploads to specified file types |

---

## Example

Here's a complete example integrating `VpUploader` with an API providing presigned URLs:

```html
<!DOCTYPE html>
<html lang="en">
	<head>
		<meta charset="UTF-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1.0" />
		<title>VpUploader Example</title>
	</head>
	<body>
		<input type="file" id="picker" />
		<button id="uploadButton">Upload</button>

		<script type="module">
			import VpUploader from "vpuploader";

			const BEARER = "your-token-here";
			const CHUNK_SIZE = 50 * 1024 * 1024;

			const uploader = new VpUploader({
				chunkSize: CHUNK_SIZE,
				debug: true,
			});

			uploader.use({
				onMultipartComplete: (response) => {
					console.log("Multipart upload complete:", response);
				},
				onProgress: (progress) => {
					console.log("Progress:", progress);
				},
				onSuccess: (details) => {
					console.log("Upload successful:", details);
				},
				onError: (error) => {
					console.error("Error:", error);
				},
			});

			const picker = document.getElementById("picker");
			const uploadButton = document.getElementById("uploadButton");

			uploadButton.onclick = async () => {
				const file = picker.files[0];
				if (!file) {
					alert("Please select a file.");
					return;
				}

				const response = await fetch("https://your-api.example.com/uploads/presigned-urls", {
					method: "POST",
					headers: {
						Authorization: `Bearer ${BEARER}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						fileName: file.name,
						fileSize: file.size,
						mimeType: file.type,
					}),
				});

				if (!response.ok) {
					console.error("Failed to get presigned URLs:", response.statusText);
					return;
				}

				const { requestKey, uploadId, presignedUrls } = await response.json();

				uploader.upload(file, {
					requestKey,
					uploadId,
					presignedUrls,
				});
			};
		</script>
	</body>
</html>
```

---

## API Reference

### Constructor

```javascript
new VpUploader(config);
```

- **`config`**:
  - `chunkSize` (`number`): Size of chunks in bytes (default: 50 MiB).
  - `debug` (`boolean`): Enable debug mode (default: `true`).
  - `allowedFileTypes` (`array`): List of allowed file types (default: `["video/*"]`).

### Methods

#### `use(callbacks)`

Registers event callbacks.

- `callbacks`:
  - `onMultipartComplete(details)`: Fired when all parts of a multipart upload are completed.
  - `onSuccess(details)`: Fired when the upload is successful.
  - `onError(error)`: Fired when an error occurs during upload.
  - `onProgress(progress)`: Fired to provide upload progress.

#### `upload(file, details)`

Uploads a file.

- **`file`** (`File`): File object to upload.
- **`details`**:

  - `requestKey` (`string`): Request key provided by the API.
  - `uploadId` (`string`): Upload ID for multipart uploads.
  - `presignedUrls` (`array`): Array of presigned URLs for each part.
