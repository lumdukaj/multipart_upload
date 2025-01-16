# VpUploader

VpUploader is a robust JavaScript library built on top of [Uppy](https://uppy.io) for managing file uploads to AWS S3. It supports both single and multipart uploads, with detailed event hooks for monitoring and advanced configuration options.

---

## Features

- **Single & Multipart Uploads**: Automatically manages file chunking for large files.
- **Configurable**: Fine-tune chunk sizes, allowed file types, and debug modes.
- **Event Hooks**: Receive detailed progress, success, and error updates.
- **Batch Uploads**: Easily handle multiple files with a single method call.
- **Custom File Details**: Pass individual details for each file, including presigned URLs.

---

## Installation

Install the package using npm:

```bash
npm install vpuploader
```

---

## Usage

### Import and Initialize

```javascript
import VpUploader from "vpuploader";

const uploader = new VpUploader({
	chunkSize: 50 * 1024 * 1024, // 50 MiB
	debug: true,
	allowedFileTypes: ["video/*"], // Restrict to video files
});
```

---

### Register Event Hooks

Use the `.use()` method to register event callbacks:

```javascript
uploader.use({
	onProgress: (progress) => console.log("Upload progress:", progress),
	onSuccess: (details) => console.log("Upload successful:", details),
	onError: (error) => console.error("Upload error:", error),
	onMultipartComplete: (details) => console.log("Multipart upload completed:", details),
	onFileRemoved: (file) => console.log("File removed:", file),
	onCancelAll: () => console.log("All uploads canceled"),
});
```

---

### Upload a Single File

Call the `upload` method for individual file uploads:

```javascript
const file = document.getElementById("filePicker").files[0];
const details = {
	requestKey: "unique-request-key",
	uploadId: "multipart-upload-id", // Optional for single-part uploads
	presignedUrls: ["https://example.com/presigned-url"],
};

uploader.upload(file, details).then(() => {
	console.log("File uploaded successfully");
});
```

---

### Upload Multiple Files

Use the `uploadFiles` method for batch uploads. Pass an array of file objects, each containing a `file` and its corresponding `details`.

```javascript
const files = [
	{
		file: file1,
		details: {
			requestKey: "request-key-1",
			uploadId: "upload-id-1",
			presignedUrls: ["url1-part1", "url1-part2"],
		},
	},
	{
		file: file2,
		details: {
			requestKey: "request-key-2",
			uploadId: "upload-id-2",
			presignedUrls: ["url2-part1", "url2-part2"],
		},
	},
];

uploader
	.uploadFiles(files, {
		onAllSuccess: (successes) => console.log("All successful uploads:", successes),
		onSomeFailure: (failures) => console.error("Failed uploads:", failures),
	})
	.then(({ successes, failures }) => {
		console.log(`${successes.length} files uploaded successfully.`);
		console.error(`${failures.length} files failed.`);
	});
```

---

### Configuration Options

| Option             | Type      | Default Value             | Description                              |
| ------------------ | --------- | ------------------------- | ---------------------------------------- |
| `chunkSize`        | `number`  | `50 * 1024 * 1024` (50MB) | Size of each chunk for multipart uploads |
| `debug`            | `boolean` | `true`                    | Enable debug logging                     |
| `allowedFileTypes` | `array`   | `["video/*"]`             | Restrict uploads to specified file types |

---

### API Reference

#### **Constructor**

```javascript
new VpUploader(config);
```

| Parameter | Type     | Description                              |
| --------- | -------- | ---------------------------------------- |
| `config`  | `Object` | Configuration object (see options above) |

---

#### **`use(callbacks)`**

Registers event callbacks.

| Callback              | Description                                        |
| --------------------- | -------------------------------------------------- |
| `onProgress`          | Fired to provide upload progress updates.          |
| `onSuccess`           | Fired when a file upload is successful.            |
| `onError`             | Fired when an error occurs during upload.          |
| `onMultipartComplete` | Fired when all parts of a multipart upload finish. |
| `onFileRemoved`       | Fired when a file is removed.                      |
| `onCancelAll`         | Fired when all uploads are canceled.               |

---

#### **`upload(file, details)`**

Uploads a single file.

| Parameter | Type     | Description                                          |
| --------- | -------- | ---------------------------------------------------- |
| `file`    | `File`   | The file to be uploaded.                             |
| `details` | `Object` | Details required for upload (e.g., `presignedUrls`). |

---

#### **`uploadFiles(fileObjects, callbacks)`**

Uploads multiple files in a batch.

| Parameter     | Type                | Description                                             |
| ------------- | ------------------- | ------------------------------------------------------- |
| `fileObjects` | `Array`             | Array of objects, each containing `file` and `details`. |
| `callbacks`   | `Object` (optional) | Callbacks for handling batch results.                   |

---

#### **`getFile(fileId)`**

Retrieves a specific file by its ID.

| Parameter | Type     | Description                     |
| --------- | -------- | ------------------------------- |
| `fileId`  | `string` | The ID of the file to retrieve. |

- **Returns**: The file object associated with the provided `fileId`, or `undefined` if not found.

---

#### **`getFiles()`**

Retrieves all files currently managed by Uppy.

- **Returns**: An array of all file objects.

---

#### **`getFilesByIds(fileIds)`**

Retrieves multiple files by their IDs.

| Parameter | Type    | Description                       |
| --------- | ------- | --------------------------------- |
| `fileIds` | `Array` | An array of file IDs to retrieve. |

- **Returns**: An array of file objects matching the provided IDs.

---

#### **`getState()`**

Retrieves the current state of the Uppy instance.

- **Returns**: An object representing the internal state of Uppy, including the list of files, progress data, and other configuration details.

---

#### **`removeFile(fileId)`**

Removes a specific file from Uppy, canceling its upload if it's in progress.

| Parameter | Type     | Description                   |
| --------- | -------- | ----------------------------- |
| `fileId`  | `string` | The ID of the file to remove. |

---

#### **`cancelAll()`**

Cancels all ongoing uploads and clears the current file queue.

- **Description**: This is useful if you want to stop all uploads and reset the uploader to its initial state.

---

#### **`retryUpload(fileId)`**

Retries the upload for a specific file.

| Parameter | Type     | Description                  |
| --------- | -------- | ---------------------------- |
| `fileId`  | `string` | The ID of the file to retry. |

---

#### **`retryAll()`**

Retries all failed uploads.

- **Description**: This is useful for retrying multiple uploads in one call, especially after fixing any issues causing failures.

---

#### **`getObjectOfFilesPerState()`**

Retrieves an object categorizing files by their upload states.

- **Returns**: An object where keys represent states (e.g., `uploading`, `failed`) and values are arrays of files in each state.

---

### Examples

#### Retrieving and Managing Files

```javascript
// Get all files
const allFiles = uploader.getFiles();
console.log("All files:", allFiles);

// Get a specific file
const file = uploader.getFile("file-id");
console.log("Specific file:", file);

// Remove a file
uploader.removeFile("file-id");
console.log("File removed.");
```

#### Canceling and Retrying Uploads

```javascript
// Cancel all uploads
uploader.cancelAll();
console.log("All uploads canceled.");

// Retry a specific upload
uploader.retryUpload("file-id");

// Retry all failed uploads
uploader.retryAll();
```

---

### Example: Full HTML Integration

```html
<!DOCTYPE html>
<html>
	<head>
		<title>VpUploader Example</title>
	</head>
	<body>
		<input type="file" id="filePicker" multiple />
		<button id="uploadButton">Upload</button>

		<script type="module">
			import VpUploader from "vpuploader";

			const uploader = new VpUploader({
				chunkSize: 50 * 1024 * 1024,
				debug: true,
				allowedFileTypes: ["video/*"],
			});

			uploader.use({
				onProgress: (progress) => console.log("Progress:", progress),
				onSuccess: (details) => console.log("File uploaded:", details),
				onError: (error) => console.error("Error:", error),
			});

			document.getElementById("uploadButton").onclick = async () => {
				const files = Array.from(document.getElementById("filePicker").files).map((file) => ({
					file,
					details: {
						requestKey: `key-${file.name}`,
						presignedUrls: ["https://example.com/upload-url"],
					},
				}));

				const { successes, failures } = await uploader.uploadFiles(files);

				console.log(`${successes.length} files uploaded successfully.`);
				console.error(`${failures.length} files failed.`);
			};
		</script>
	</body>
</html>
```
