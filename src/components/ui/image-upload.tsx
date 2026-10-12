import React, { useCallback, useRef, useState } from 'react';
import { Upload, X, ImageIcon, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface ImageUploadProps {
  value?: string;
  onChange: (url: string) => void;
  bucket: string;
  folder?: string;
  className?: string;
}

export const ImageUpload: React.FC<ImageUploadProps> = ({
  value,
  onChange,
  bucket,
  folder = '',
  className,
}) => {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const uploadFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith('image/')) {
        toast({ title: 'Only image files are allowed', variant: 'destructive' });
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        toast({ title: 'Image must be under 5MB', variant: 'destructive' });
        return;
      }

      setUploading(true);
      try {
        // All images go through Cloudinary. The browser never holds the API
        // secret: the cloudinary-sign edge function (JWT-protected) signs the
        // upload parameters, then the file goes directly to Cloudinary.
        // The old `bucket` prop doubles as the Cloudinary folder name.
        const { data: sig, error: sigError } = await supabase.functions.invoke('cloudinary-sign', {
          body: { folder: bucket },
        });
        if (sigError || !sig?.signature) {
          throw new Error(sig?.error || sigError?.message || 'Could not authorize upload');
        }

        const form = new FormData();
        form.append('file', file);
        form.append('api_key', sig.apiKey);
        form.append('timestamp', String(sig.timestamp));
        form.append('signature', sig.signature);
        form.append('folder', sig.folder);

        const res = await fetch(`https://api.cloudinary.com/v1_1/${sig.cloudName}/image/upload`, {
          method: 'POST',
          body: form,
        });
        const result = await res.json();
        if (!res.ok || !result.secure_url) {
          throw new Error(result?.error?.message || 'Upload failed');
        }

        onChange(result.secure_url);
        toast({ title: 'Image uploaded successfully' });
      } catch (err: any) {
        toast({ title: 'Upload failed', description: err.message, variant: 'destructive' });
      } finally {
        setUploading(false);
      }
    },
    [bucket, onChange, toast]
  );

  const handleRemove = useCallback(async () => {
    // Clearing the reference is enough — unreferenced Cloudinary files are
    // harmless and can be tidied from the Cloudinary media library if needed.
    onChange('');
  }, [onChange]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) uploadFile(file);
    },
    [uploadFile]
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) uploadFile(file);
      if (inputRef.current) inputRef.current.value = '';
    },
    [uploadFile]
  );

  if (value) {
    return (
      <div className={cn('relative group rounded-xl overflow-hidden border border-border bg-muted', className)}>
        <img
          src={value}
          alt="Uploaded"
          className="w-full h-40 object-cover"
        />
        <button
          type="button"
          onClick={handleRemove}
          className="absolute top-2 right-2 p-1.5 rounded-full bg-destructive text-destructive-foreground shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      className={cn(
        'relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed cursor-pointer transition-colors h-40',
        dragOver
          ? 'border-primary bg-primary/5'
          : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50',
        uploading && 'pointer-events-none opacity-60',
        className
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />
      {uploading ? (
        <>
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
          <p className="text-sm text-muted-foreground">Uploading...</p>
        </>
      ) : (
        <>
          <div className="p-3 rounded-full bg-muted">
            <Upload className="w-6 h-6 text-muted-foreground" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-foreground">Click or drag to upload</p>
            <p className="text-xs text-muted-foreground mt-0.5">JPG, PNG, WebP up to 5MB</p>
          </div>
        </>
      )}
    </div>
  );
};
