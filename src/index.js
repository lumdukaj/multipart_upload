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
		this.presignedUrls = [];
		this.uploadId = null;
		this.requestKey = null;
		this.uppy = null;
		this.isMultiPart = false;
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
		this.bindGetterMethods();
	}

	async handleCreateMultipartUpload(file) {
		try {
			if (!this.requestKey) throw new Error("Request key not set.");
			if (this.isMultiPart && !this.uploadId)
				throw new Error("Upload ID not set. This is needed for multipart uploads.");

			return { uploadId: this.uploadId, key: this.requestKey };
		} catch (error) {
			this.log(`Error in createMultipartUpload: ${error}`, "error");
			throw error;
		}
	}

	handleSignPart(file, partData) {
		try {
			if (!this.presignedUrls) throw new Error("Presigned URLs are missing");

			const index = this.isMultiPart ? partData.partNumber - 1 : 0;
			const url = this.presignedUrls[index];
			return { url, headers: { "Content-Type": "application/octet-stream" } };
		} catch (error) {
			this.log(`Error in signPart: ${error}`, "error");
			throw error;
		}
	}

	// This method needs to return an object to fit with the Uppy API, but we don't need to do anything here so we just return an empty object.
	async handleCompleteMultipartUpload(file, { uploadId, key, parts }) {
		try {
			// Skip in case of single part upload
			if (!this.isMultiPart) return {};

			if (!this.onMultipartComplete) {
				this.log("No onMultipartComplete callback provided", "warn");
				return;
			}

			const parsedParts = parts.map((part) => ({
				eTag: part.ETag.split('"').join(""),
				partNumber: part.PartNumber,
			}));

			this.onMultipartComplete({
				requestKey: key,
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
			this.log("Upload successful", "info");
			if (!this.onSuccess) {
				this.log("No onSuccess callback provided", "warn");
				return;
			}

			const requestKey = file.s3Multipart.key;
			this.onSuccess({ requestKey });

			// Clear the state after successful upload
			// Shouldnt be called if upload is ongoing
			// this.uppy.clear();
		});

		this.uppy.on("error", async (error) => {
			this.log(`Upload error: ${error}`, "error");

			if (!this.onError) {
				this.log("No onError callback provided", "warn");
				return;
			}

			this.onError(error);
		});
	}

	bindGetterMethods() {
		this.getFile = this.uppy.getFile.bind(this.uppy);
		this.getFiles = this.uppy.getFiles.bind(this.uppy);
		this.getFilesByIds = this.uppy.getFilesByIds.bind(this.uppy);
		this.getState = this.uppy.getState.bind(this.uppy);
		this.getObjectOfFilesPerState = this.uppy.getObjectOfFilesPerState.bind(this.uppy);
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

			if (this.isMultiPart) {
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
	 */
	use(callbacks) {
		if (callbacks.onMultipartComplete) this.onMultipartComplete = callbacks.onMultipartComplete;
		if (callbacks.onSuccess) this.onSuccess = callbacks.onSuccess;
		if (callbacks.onError) this.onError = callbacks.onError;
		if (callbacks.onProgress) this.onProgress = callbacks.onProgress;
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
	upload(file, details) {
		if (!(file instanceof File)) {
			throw new Error("Invalid file provided. Please provide a File object.");
		}

		this.isMultiPart = file.size > this.chunkSize;

		this.validateDetails(details);

		this.requestKey = details.requestKey;
		this.uploadId = details.uploadId;
		this.presignedUrls = details.presignedUrls;

		this.uppy.addFile({
			name: file.name,
			type: file.type,
			data: file,
		});

		this.uppy.upload();
	}

	log(message, level = "log") {
		if (this.debug) console[level](message);
	}
}

export default VpUploader;
