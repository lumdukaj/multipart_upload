import Uppy from "@uppy/core";
import AwsS3 from "@uppy/aws-s3";

class VpUploader {
	/**
	 * Constructor to initialize VpUploader
	 * @param {Object} config - Configuration options
	 * @param {number} config.chunkSize - Chunk size for multipart uploads in bytes.
	 * @param {boolean} config.debug - Enable debug mode for Uppy
	 */
	constructor(config) {
		config = config || {
			chunkSize: 50 * 1024 * 1024, // 5 MB
			debug: true,
		};

		this.chunkSize = config.chunkSize;
		this.debug = config.debug;
		this.presignedUrls = [];
		this.uploadId = null;
		this.requestKey = null;

		this.uppy = new Uppy({
			debug: this.debug,
			restrictions: {
				allowedFileTypes: ["video/*"],
			},
			autoProceed: false,
		});

		this.uppy.use(AwsS3, {
			getChunkSize: (file) => {
				return this.chunkSize;
			},

			shouldUseMultipart: () => {
				return true;
			},

			createMultipartUpload: async (file) => {
				if (!this.requestKey) {
					throw new Error(
						"Request key not set. Ensure initialization is complete before uploading."
					);
				}

				if (this.isMultiPart && !this.uploadId) {
					throw new Error("Upload ID not set. Ensure initialization is complete before uploading.");
				}

				return { uploadId: this.uploadId, key: this.requestKey };
			},

			signPart: async (file, partData) => {
				if (!this.presignedUrls) {
					throw new Error("Presigned URLs are missing");
				}

				const index = this.isMultiPart ? partData.partNumber - 1 : 0;

				const url = this.presignedUrls[index];

				return { url, headers: { "Content-Type": "application/octet-stream" } };
			},

			completeMultipartUpload: async (file, { uploadId, key, parts }) => {
				// Skip in case of single part upload
				if (!this.isMultiPart) return {};

				if (!this.onMultipartComplete) {
					console.error("No onMultipartComplete callback provided");
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
			},
		});

		this.uppy.on("upload-success", (file) => {
			if (!this.onSuccess) {
				console.error("No onSuccess callback provided");
				return;
			}

			const requestKey = file.s3Multipart.key;
			this.onSuccess({ requestKey });
		});

		this.uppy.on("error", (error) => {
			console.error("Upload error:", error);

			if (!this.onError) {
				console.error("No onError callback provided");
				return;
			}

			this.onError(error);
		});
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
	upload(file, details, onMultipartComplete, onSuccess, onError) {
		this.requestKey = details.requestKey;
		this.uploadId = details.uploadId;
		this.presignedUrls = details.presignedUrls;
		this.onMultipartComplete = onMultipartComplete;
		this.onSuccess = onSuccess;
		this.onError = onError;

		if (!(file instanceof File)) {
			throw new Error("Invalid file provided. Please provide a File object.");
		}

		this.isMultiPart = file.size > this.chunkSize;

		this.uppy.addFile({
			name: file.name,
			type: file.type,
			data: file,
		});

		this.uppy.upload();
	}
}

export default VpUploader;
