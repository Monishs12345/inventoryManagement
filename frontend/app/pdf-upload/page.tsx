'use client'

import { useState } from 'react'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Upload, Loader2 } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

interface CommonPart {
  part_no: string
  sales_qty: number
}

export default function PDFUpload() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [commonParts, setCommonParts] = useState<CommonPart[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file && file.type === 'application/pdf') {
      setSelectedFile(file)
      setError(null)
    } else {
      setSelectedFile(null)
      setError('Please select a valid PDF file')
    }
  }

  const handleUpload = async () => {
    if (!selectedFile) return

    setIsUploading(true)
    setError(null)
    setSuccess(null)
    const formData = new FormData()
    formData.append('pdfFile', selectedFile)

    try {
      const response = await fetch('http://localhost:5000/uploadPDF', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json()
      if (data.success) {
        setCommonParts(data.commonParts)
        setSuccess('PDF uploaded and processed successfully')
      } else {
        throw new Error('Failed to process PDF')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred')
      setCommonParts([])
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle>BOM Comparison Tool</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <input
              type="file"
              accept=".pdf"
              onChange={handleFileChange}
              className="file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
            />
            <Button
              onClick={handleUpload}
              disabled={!selectedFile || isUploading}
              className="flex items-center gap-2"
            >
              {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
              {isUploading ? 'Uploading...' : 'Upload PDF & Compare'}
            </Button>
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {success && (
            <Alert variant="default">
              <AlertTitle>Success</AlertTitle>
              <AlertDescription>{success}</AlertDescription>
            </Alert>
          )}
        </div>

        <div>
          <h3 className="text-lg font-semibold mb-4">Common Parts between PDF and BOMs:</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Part No</TableHead>
                <TableHead>Sales Qty</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {commonParts.map((part) => (
                <TableRow key={part.part_no}>
                  <TableCell>{part.part_no}</TableCell>
                  <TableCell>{part.sales_qty}</TableCell>
                </TableRow>
              ))}
              {commonParts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={2} className="text-center text-muted-foreground">
                    {isUploading ? 'Loading...' : 'No common parts found'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}