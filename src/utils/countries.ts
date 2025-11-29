export const getCountryFlag = (countryCode: string) => {
  const code = 127397; // Unicode offset for country flags
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map((char) => code + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
};
