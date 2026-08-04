function normalizeUrl(input) {
  const trimmed = input.trim();

  if (!trimmed) {
    throw new Error('A URL is required.');
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  try {
    return new URL(`https://${trimmed}`).toString();
  } catch (error) {
    throw new Error(`Invalid URL: ${input}`);
  }
}

module.exports = { normalizeUrl };
