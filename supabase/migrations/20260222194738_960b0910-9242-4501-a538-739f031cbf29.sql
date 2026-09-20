
-- Create storage bucket for delivery partner documents
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('delivery-documents', 'delivery-documents', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']);

-- RLS policies for delivery-documents bucket
CREATE POLICY "Public read access for delivery documents"
ON storage.objects FOR SELECT
USING (bucket_id = 'delivery-documents');

CREATE POLICY "Authenticated users can upload delivery documents"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'delivery-documents' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update delivery documents"
ON storage.objects FOR UPDATE
USING (bucket_id = 'delivery-documents' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete delivery documents"
ON storage.objects FOR DELETE
USING (bucket_id = 'delivery-documents' AND auth.role() = 'authenticated');
