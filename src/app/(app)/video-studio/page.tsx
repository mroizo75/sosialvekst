import { VideoStudio } from "@/components/video/VideoStudio";

export default function VideoStudioPage() {
  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">AI Video Studio</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Generer profesjonelle videoer med AI. Perfekt for TikTok, Instagram Reels og annet kort videoinnhold.
        </p>
      </div>
      <VideoStudio />
    </>
  );
}
