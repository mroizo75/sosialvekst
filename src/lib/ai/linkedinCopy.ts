const subjectOf = (topic: string): string => {
  const stripped = topic
    .replace(/^slik ser\s+/i, "")
    .replace(/\s+ut i praksis\b.*$/i, "")
    .replace(/[?!.]+$/g, "")
    .trim();
  return stripped || "fagområdet";
};

export const linkedInFallbackText = (
  topic: string,
  brand?: { companyName?: string; industry?: string },
): string => {
  const subject = subjectOf(topic);
  const company = brand?.companyName?.trim();
  const industry = brand?.industry?.trim();
  const place = company ? `hos oss i ${company}` : "i bedriftene jeg jobber med";
  const field = industry ? ` I ${industry} ser jeg det oftest slik.` : "";

  return [
    `Det som avgjør om ${subject} fungerer i en bedrift, er sjelden systemet.`,
    "",
    `Jeg ser det samme ${place}: arbeidet blir gjort, men ansvaret er uklart, og oppfølgingen stopper når hverdagen tar over.${field}`,
    "",
    "Det jeg ber en leder gjøre først:",
    "Gi én person eierskap. Ikke et utvalg.",
    "Skriv kravet der arbeidet skjer, ikke i en perm som ingen åpner.",
    "Følg opp det som glipper samme uke. Ikke i neste rapport.",
    "",
    "Hva er det første som stopper hos dere?",
  ].join("\n");
};
