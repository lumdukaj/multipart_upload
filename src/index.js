import Uppy from "@uppy/core";
import AwsS3 from "@uppy/aws-s3";

const DEFAULT_CONFIG = {
	chunkSize: 50 * 1024 * 1024, // 50 MiB
	debug: true,
	allowedFileTypes: ["video/*"],
};

class VpUploader {
	/**
	 * Constructor to initialize VpUploader
	 * @param {Object} config - Configuration options
	 * @param {number} config.chunkSize - Chunk size for multipart uploads in bytes.
	 * @param {boolean} config.debug - Enable debug mode for Uppy
	 */
	constructor(config) {
		this.config = this.validateConfig(config);
		this.chunkSize = this.config.chunkSize;
		this.debug = this.config.debug;
		this.allowedFileTypes = this.config.allowedFileTypes;
		/**
		 * Map to store details of each file being uploaded.
		 * @type {Map<string, Object>}
		 * @property {string} requestKey - Request key for the upload
		 * @property {string} uploadId - Upload ID for the upload
		 * @property {Array<string>} presignedUrls - Array of presigned URLs for each part
		 * @property {boolean} isMultiPart - Flag to indicate if the file is multipart
		 */
		this.fileDetails = new Map();

		this.uppy = null;

		/**
		 * Callback to be called on multipart complete.
		 * Gets called with an object containing requestKey and parts.
		 * @param {Object} details - Object containing requestKey and parts
		 * @param {string} details.requestKey - Request key for the upload
		 * @param {Array} details.parts - Array of parts containing partNumber and eTag
		 */
		this.onMultipartComplete = null;
		/**
		 * Callback to be called on upload progress.
		 * @param {Number} progress - Progress amount
		 */
		this.onProgress = null;
		/**
		 * Callback to be called on successful upload.
		 * Gets called with an object containing requestKey.
		 * @param {Object} details - Object containing requestKey
		 * @param {string} details.requestKey - Request key for the upload
		 */
		this.onSuccess = null;
		/**
		 * Callback to be called on upload error.
		 * @param {Error} error - Error object
		 */
		this.onError = null;

		this.initializeUppy();
	}

	initializeUppy() {
		this.uppy = new Uppy({
			debug: this.debug,
			restrictions: {
				allowedFileTypes: this.allowedFileTypes,
			},
			autoProceed: false,
		});

		this.uppy.use(AwsS3, {
			getChunkSize: () => this.chunkSize,
			shouldUseMultipart: () => true,
			createMultipartUpload: this.handleCreateMultipartUpload.bind(this),
			signPart: this.handleSignPart.bind(this),
			completeMultipartUpload: this.handleCompleteMultipartUpload.bind(this),
		});

		this.setUppyEventListeners();
		this.bindMethods();
	}

	async handleCreateMultipartUpload(file) {
		try {
			const details = this.fileDetails.get(file.name);
			if (!details) throw new Error("Details not found for the file.");

			const { requestKey, uploadId, isMultiPart } = details;

			if (!requestKey) throw new Error("Request key not set.");

			if (isMultiPart && !uploadId)
				throw new Error("Upload ID not set. This is needed for multipart uploads.");

			return { uploadId: uploadId, key: requestKey };
		} catch (error) {
			this.log(`Error in createMultipartUpload: ${error}`, "error");
			throw error;
		}
	}

	handleSignPart(file, partData) {
		try {
			const details = this.fileDetails.get(file.name);
			const { presignedUrls, isMultiPart } = details;
			if (!presignedUrls) throw new Error("Presigned URLs are missing");

			const index = isMultiPart ? partData.partNumber - 1 : 0;
			const url = presignedUrls[index];
			return { url, headers: { "Content-Type": "application/octet-stream" } };
		} catch (error) {
			this.log(`Error in signPart: ${error}`, "error");
			throw error;
		}
	}

	// This method needs to return an object to fit with the Uppy API, but we don't need to do anything here so we just return an empty object.
	async handleCompleteMultipartUpload(file, { uploadId, key, parts }) {
		try {
			const details = this.fileDetails.get(file.name);
			const { requestKey, isMultiPart } = details;
			// Skip in case of single part upload
			if (!isMultiPart) return {};

			if (!this.onMultipartComplete) {
				this.log("No onMultipartComplete callback provided", "warn");
				return;
			}

			const parsedParts = parts.map((part) => ({
				eTag: part.ETag.split('"').join(""),
				partNumber: part.PartNumber,
			}));

			this.onMultipartComplete({
				requestKey,
				parts: parsedParts,
			});

			return {};
		} catch (error) {
			this.log(`Error in completeMultipartUpload: ${error}`, "error");
			throw error;
		}
	}

	setUppyEventListeners() {
		this.uppy.on("progress", (progress) => {
			if (!this.onProgress) return;
			this.onProgress(progress);
		});

		this.uppy.on("upload-success", async (file) => {
			try {
				this.log("Upload successful", "info");

				// Lastly, we need to remove the file that has been uploaded from uppy and clear the file details
				this.removeFile(file.id);
				this.fileDetails.delete(file.name);

				if (!this.onSuccess) {
					this.log("No onSuccess callback provided", "info");
					return;
				}

				const requestKey = file.s3Multipart.key;
				this.onSuccess({ requestKey });
			} catch (error) {}
		});

		this.uppy.on("error", async (error, file, response) => {
			this.log(`Upload error: ${error}`, "error");

			if (!this.onError) {
				this.log("No onError callback provided", "info");
				return;
			}

			const details = this.fileDetails.get(file.name);

			this.onError({ error, details, file, response });
		});

		this.uppy.on("file-removed", (file) => {
			this.log("File removed", "info", file);

			// We add this in case removeFile is called directly
			this.fileDetails.delete(file.name);

			if (!this.onFileRemoved) {
				this.log("No onFileRemoved callback provided", "info");
				return;
			}

			this.onFileRemoved(file);
		});

		this.uppy.on("cancel-all", (event) => {
			this.log("All uploads cancelled", "info", event);

			this.fileDetails.clear();

			if (!this.onCancelAll) {
				this.log("No onCancelAll callback provided", "info");
				return;
			}

			this.onCancelAll();
		});
	}

	bindMethods() {
		this.getFile = this.uppy.getFile.bind(this.uppy);
		this.getFiles = this.uppy.getFiles.bind(this.uppy);
		this.getFilesByIds = this.uppy.getFilesByIds.bind(this.uppy);
		this.getState = this.uppy.getState.bind(this.uppy);
		this.getObjectOfFilesPerState = this.uppy.getObjectOfFilesPerState.bind(this.uppy);

		/**
		 * @param {string} fileId - ID of the file to be removed
		 * Removes a file from Uppy. Removing a file that is already being uploaded will cancel the upload.
		 */
		this.removeFile = this.uppy.removeFile.bind(this.uppy);
		// Cancels all uploads in progress.
		this.cancelAll = this.uppy.cancelAll.bind(this.uppy);

		this.retryUpload = this.uppy.retryUpload.bind(this.uppy);
		this.retryAll = this.uppy.retryAll.bind(this.uppy);
	}

	getFileDetails(file) {
		if (!(file instanceof File))
			return this.log("Invalid file provided. Please provide a File object.", "info");

		return this.fileDetails.get(file.name);
	}

	setFileDetails(file, detailToAdd) {
		if (!(file instanceof File))
			return this.log("Invalid file provided. Please provide a File object.", "info");

		const existingDetails = this.fileDetails.get(file.name) || {};
		const updatedDetails = { ...existingDetails, ...detailToAdd };
		this.fileDetails.set(file.name, updatedDetails);
	}

	validateConfig(userConfig = {}) {
		try {
			if (typeof userConfig !== "object" || userConfig === null) {
				throw new Error("Configuration must be an object.");
			}

			// Create a new configuration object by merging defaults and userConfig
			const finalConfig = { ...DEFAULT_CONFIG, ...userConfig };

			// Validate each configuration option
			Object.keys(finalConfig).forEach((key) => {
				switch (key) {
					case "chunkSize":
						if (typeof finalConfig.chunkSize !== "number" || finalConfig.chunkSize <= 0) {
							throw new Error("'chunkSize' must be a positive number.");
						}
						break;

					case "debug":
						if (typeof finalConfig.debug !== "boolean") {
							throw new Error("'debug' must be a boolean.");
						}
						break;

					case "allowedFileTypes":
						if (!Array.isArray(finalConfig.allowedFileTypes)) {
							throw new Error("'allowedFileTypes' must be an array.");
						}
						break;

					default:
						console.warn(`Unknown configuration option: ${key}`);
				}
			});

			// Return the validated and merged configuration
			return finalConfig;
		} catch (error) {
			this.log(`Error in validateConfig: ${error}`, "error");
			throw error;
		}
	}

	validateDetails(details) {
		try {
			if (typeof details !== "object" || details === null) {
				throw new Error("Details must be an object.");
			}

			if (typeof details.requestKey !== "string" || details.requestKey.length === 0) {
				throw new Error("Request key must be a non-empty string.");
			}

			if (!Array.isArray(details.presignedUrls) || details.presignedUrls.length === 0) {
				throw new Error("Presigned URLs must be a non-empty array.");
			}

			if (details.isMultiPart) {
				if (typeof details.uploadId !== "string" || details.uploadId.length === 0) {
					throw new Error(
						"Upload ID is required for multipart uploads and must be a non-empty string."
					);
				}

				if (details.presignedUrls.length === 1) {
					throw new Error("Presigned URLs must be an array of URLs for each part.");
				}
			}
		} catch (error) {
			this.log(`Error in validateDetails: ${error}`, "error");
			throw error;
		}
	}

	/**
	 *
	 * @param {Object} callbacks - Callbacks to be used by the uploader
	 * @param {Function} callbacks.onMultipartComplete - Callback to be called on multipart complete
	 * @param {Function} callbacks.onSuccess - Callback to be called on successful
	 * @param {Function} callbacks.onError - Callback to be called on error
	 * @param {Function} callbacks.onProgress - Callback to be called on progress
	 * @param {Function} callbacks.onFileRemoved - Callback to be called on file removed
	 * @param {Function} callbacks.onCancelAll - Callback to be called on cancel all
	 */
	use(callbacks) {
		if (callbacks.onMultipartComplete) this.onMultipartComplete = callbacks.onMultipartComplete;
		if (callbacks.onSuccess) this.onSuccess = callbacks.onSuccess;
		if (callbacks.onError) this.onError = callbacks.onError;
		if (callbacks.onProgress) this.onProgress = callbacks.onProgress;
		if (callbacks.onFileRemoved) this.onFileRemoved = callbacks.onFileRemoved;
		if (callbacks.onCancelAll) this.onCancelAll = callbacks.onCancelAll;
	}

	/**
	 *
	 * @param {*} file - File to be uploaded
	 * @param {*} details.requestKey - Request key for the upload
	 * @param {*} details.uploadId - Upload ID for the upload
	 * @param {*} details.presignedUrls - Array of presigned URLs for each part
	 * @param {*} onMultipartComplete - Callback to be called on multipart complete
	 * @param {*} onSuccess - Callback to be called on successful
	 */
	async upload(file, details = {}) {
		if (!(file instanceof File)) {
			throw new Error("Invalid file provided. Please provide a File object.");
		}

		details.isMultiPart = file.size > this.chunkSize;

		this.validateDetails(details);

		this.fileDetails.set(file.name, details);

		this.uppy.addFile({
			name: file.name,
			type: file.type,
			data: file,
		});

		return this.uppy.upload();
	}

	async uploadFiles(fileObjects, { onAllSuccess, onSomeFailure } = {}) {
		if (!Array.isArray(fileObjects)) {
			throw new Error(
				"Invalid input. Provide an array of objects, each containing a file and its details."
			);
		}

		// Validate each file object
		fileObjects.forEach(({ file, details }, index) => {
			if (!(file instanceof File)) {
				throw new Error(`Invalid file at index ${index}. Ensure all files are instances of File.`);
			}

			if (!details || typeof details !== "object") {
				throw new Error(
					`Invalid details at index ${index}. Provide a valid details object for each file.`
				);
			}

			if (!details.requestKey || !Array.isArray(details.presignedUrls)) {
				throw new Error(
					`Missing or invalid properties in details at index ${index}. Ensure requestKey and presignedUrls are valid.`
				);
			}
		});

		const promises = fileObjects.map(({ file, details }) => this.upload(file, details));

		const results = await Promise.allSettled(promises);

		const successes = results.filter((result) => result.status === "fulfilled");
		const failures = results.filter((result) => result.status === "rejected");

		if (successes.length && typeof onAllSuccess === "function") {
			onAllSuccess(successes);
		}

		if (failures.length && typeof onSomeFailure === "function") {
			onSomeFailure(failures);
		}

		return { successes, failures, results };
	}

	log(message, level = "log", details) {
		if (this.debug) {
			console[level](message, details);
		}
	}
}

export default VpUploader;
