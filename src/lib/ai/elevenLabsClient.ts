// Direct ElevenLabs API, used when ELEVENLABS_API_KEY is set. fal.ai only accepts its built-in voices,
// so native Norwegian voices from the ElevenLabs voice library need this route.

const ELEVENLABS_TTS_URL = "https://api.elevenlabs.io/v1/text-to-speech";
export const ELEVENLABS_MODEL = "eleven_v3";

export const getElevenLabsKey = (): string | null => process.env.ELEVENLABS_API_KEY?.trim() || null;

export const isElevenLabsAvailable = (): boolean => Boolean(getElevenLabsKey());

export const elevenLabsPayload = (text: string): Record<string, unknown> => ({
  text,
  model_id: ELEVENLABS_MODEL,
  language_code: "no",
  voice_settings: { stability: 0.5, similarity_boost: 0.75 },
});

export const synthesizeElevenLabsSpeech = async (text: string, voiceId: string): Promise<Uint8Array> => {
  const apiKey = getElevenLabsKey();
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY mangler.");
  if (!text.trim()) throw new Error("Taletekst mangler.");

  const response = await fetch(
    `${ELEVENLABS_TTS_URL}/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify(elevenLabsPayload(text)),
    },
  );
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`ElevenLabs TTS feilet (${response.status}): ${body.slice(0, 300)}`);
  }
  const audio = new Uint8Array(await response.arrayBuffer());
  if (audio.byteLength === 0) throw new Error("ElevenLabs returnerte tom lydfil.");
  return audio;
};
