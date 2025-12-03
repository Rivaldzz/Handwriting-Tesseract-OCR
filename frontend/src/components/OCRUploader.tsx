'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, Copy, Check, Loader2, RotateCw, Image as ImageIcon } from 'lucide-react';

interface TextBox {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
}

interface OCRResult {
  text: string;
  rotation_angle: number;
  text_boxes: TextBox[];
  processed_image: string;
  total_boxes: number;
}

export default function OCRUploader() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [ocrResult, setOcrResult] = useState<OCRResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [error, setError] = useState<string>('');

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setOcrResult(null);
      setError('');
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.bmp']
    },
    maxFiles: 1
  });

  const processOCR = async () => {
    if (!selectedFile) return;

    setIsProcessing(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const response = await fetch('http://localhost:8000/process-ocr', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('OCR processing failed');
      }

      const result = await response.json();
      setOcrResult(result.data);
    } catch (err) {
      setError('Gagal memproses gambar. Pastikan backend berjalan di localhost:8000');
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  const copyToClipboard = async () => {
    if (!ocrResult?.text) return;

    try {
      await navigator.clipboard.writeText(ocrResult.text);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-12 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">
            OCR Tulisan Tangan
          </h1>
          <p className="text-gray-600">
            Upload gambar tulisan tangan dan convert menjadi teks digital
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Upload Section */}
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <Upload className="w-5 h-5" />
              Upload Gambar
            </h2>

            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all ${
                isDragActive
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-300 hover:border-blue-400'
              }`}
            >
              <input {...getInputProps()} />
              <ImageIcon className="w-12 h-12 mx-auto mb-4 text-gray-400" />
              {isDragActive ? (
                <p className="text-blue-600">Drop gambar di sini...</p>
              ) : (
                <div>
                  <p className="text-gray-600 mb-2">
                    Drag & drop gambar atau klik untuk browse
                  </p>
                  <p className="text-sm text-gray-400">
                    Format: PNG, JPG, JPEG, GIF, BMP
                  </p>
                </div>
              )}
            </div>

            {previewUrl && (
              <div className="mt-4">
                <p className="text-sm font-medium text-gray-700 mb-2">Preview:</p>
                <img
                  src={previewUrl}
                  alt="Preview"
                  className="w-full rounded-lg border border-gray-200"
                />
                <button
                  onClick={processOCR}
                  disabled={isProcessing}
                  className="w-full mt-4 bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-lg transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    'Proses OCR'
                  )}
                </button>
              </div>
            )}

            {error && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {error}
              </div>
            )}
          </div>

          {/* Result Section */}
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Hasil OCR</h2>

            {ocrResult ? (
              <div className="space-y-4">
                {/* Info */}
                <div className="flex gap-4 text-sm text-gray-600">
                  <div className="flex items-center gap-1">
                    <RotateCw className="w-4 h-4" />
                    <span>Rotasi: {ocrResult.rotation_angle}°</span>
                  </div>
                  <div>
                    <span>Blok teks: {ocrResult.total_boxes}</span>
                  </div>
                </div>

                {/* Processed Image with Bounding Boxes */}
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">
                    Gambar dengan Bounding Box:
                  </p>
                  <img
                    src={ocrResult.processed_image}
                    alt="Processed"
                    className="w-full rounded-lg border border-gray-200"
                  />
                </div>

                {/* Extracted Text */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <p className="text-sm font-medium text-gray-700">
                      Teks Terekstrak:
                    </p>
                    <button
                      onClick={copyToClipboard}
                      className="flex items-center gap-1 px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-md text-sm transition-colors"
                    >
                      {isCopied ? (
                        <>
                          <Check className="w-4 h-4 text-green-600" />
                          <span className="text-green-600">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                  <textarea
                    value={ocrResult.text}
                    readOnly
                    className="w-full h-64 p-3 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 text-blue-700 font-medium"
                  />
                </div>

                {/* Text Boxes Details */}
                <details className="text-sm">
                  <summary className="cursor-pointer font-medium text-gray-700 hover:text-blue-600">
                    Detail Deteksi Teks ({ocrResult.text_boxes.length} blok)
                  </summary>
                  <div className="mt-2 max-h-40 overflow-y-auto space-y-1">
                    {ocrResult.text_boxes.map((box, idx) => (
                      <div key={idx} className="p-2 bg-gray-50 rounded text-xs">
                        <span className="font-medium">{box.text}</span>
                        <span className="text-gray-500 ml-2">
                          ({box.confidence.toFixed(1)}% confidence)
                        </span>
                      </div>
                    ))}
                  </div>
                </details>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-400">
                <p>Hasil OCR akan muncul di sini</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}