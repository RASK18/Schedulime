const metadataSeparatorPattern = String.raw`(?:\s*(?:<br\s*\/?>|\n)\s*){2,}`;
const formattingTagPattern = String.raw`(?:<(?:i|em|b|strong)>\s*)?`;
const closingFormattingTagPattern = String.raw`(?:<\/(?:i|em|b|strong)>\s*)?`;

const trailingDescriptionPatterns = [
  new RegExp(
    `${metadataSeparatorPattern}${formattingTagPattern}\\(Source:\\s*[^)]+\\)\\s*${closingFormattingTagPattern}(?=${metadataSeparatorPattern}|\\s*$)`,
    'gi'
  ),
  new RegExp(`${metadataSeparatorPattern}${formattingTagPattern}Note:\\s*[\\s\\S]*$`, 'gi')
];

export const sanitizeAnimeDescription = (description: string): string => {
  let sanitizedDescription = description.replace(/\r\n?/g, '\n');
  let previousDescription: string | null = null;

  while (sanitizedDescription !== previousDescription) {
    previousDescription = sanitizedDescription;
    sanitizedDescription = trailingDescriptionPatterns.reduce(
      (currentDescription, pattern) => currentDescription.replace(pattern, ''),
      sanitizedDescription
    );
  }

  return sanitizedDescription.trim();
};
