// Clean display text from external profiles and handbook content without modifying stored data.
export function displayText(text: string) {
  return text.replace(/[#*\d]\uFE0F?\u20E3|(?:\p{Extended_Pictographic}|\p{Regional_Indicator})(?:[\uFE0E\uFE0F]|\p{Emoji_Modifier}|[\u{E0020}-\u{E007F}])*(?:\u200D(?=\p{Extended_Pictographic}))?/gu, '');
}
