import crypto from "crypto";

/**
 * Uppercase characters
 * @type {string}
 */
const UPPERCASE = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/**
 * Lowercase characters
 * @type {string}
 */
const LOWERCASE = "abcdefghijklmnopqrstuvwxyz";

/**
 * Numbers
 * @type {string}
 */
const NUMBERS = "0123456789";

/**
 * Special characters
 * @see https://owasp.org/www-community/password-special-characters
 * @type {string}
 */
const SPECIAL_CHARACTERS = "-._~";
const UNSAFE_SPECIAL_CHARACTERS = "!\"#$%&'()*+,/:;<=>?@[\\]^`{|}";

/**
 * Function that generates random lengths for the password
 * @returns {number[]}
 */
function randomPartition(total = 32) {
  // Adjust the total by subtracting the minimum requirement
  const parts = 4;
  const minVal = 2;

  const adjustedTotal = total - parts * minVal;

  // Pick random "cut points" for partitioning adjustedTotal
  let cuts = [];
  for (let i = 0; i < parts - 1; i++) {
    cuts.push(crypto.randomInt(0, adjustedTotal + 1));
  }
  cuts.sort((a, b) => a - b);

  // Build the partition
  let result = [];
  let prev = 0;
  for (let i = 0; i < parts - 1; i++) {
    result.push(cuts[i] - prev + minVal);
    prev = cuts[i];
  }
  result.push(adjustedTotal - prev + minVal);

  return result;
}

/**
 * Shuffles the string
 * @param str
 * @returns {*}
 */
function shuffle(str) {
  // Convert a string into an array (so we can swap characters)
  const arr = str.split("");

  // Fisher–Yates shuffle with crypto.randomInt
  for (let i = arr.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1); // 0 ≤ j ≤ i
    [arr[i], arr[j]] = [arr[j], arr[i]]; // swap
  }

  return arr.join("");
}

/**
 * Check password complexity
 * @param {string} password
 */
function checkTokenComplexity(password) {
  // Zero-length or undefined inputs
  if (!password || password.trim().length === 0 || password.length < 8) {
    return false;
  }

  return (
    (password.match(/[a-z]/g) ?? []).length >= 2 && // At least there are 2 lowercase characters
    (password.match(/[A-Z]/g) ?? []).length >= 2 && // At least there are 2 uppercase characters
    (password.match(/[0-9]/g) ?? []).length >= 2 && // At least there should be 2 numbers
    (password.match(/[!"#$%&'()*+,-./:;<=>?@[\\\]^_`{|}~]/g) ?? []).length >= 2
  ); // 2 Symbols.
}

export function generateToken(length = 32, urlUnsafeEnabled = false) {
  let result = "";
  while (!checkTokenComplexity(result)) {
    // Reset the contents
    result = "";

    // Randomize proportions for the password
    const [lowerLength, upperLength, numberCount, symbolCount] = randomPartition(length);

    // Lowercase characters
    for (let i = 0; i < lowerLength; i++) {
      result += LOWERCASE[crypto.randomInt(0, LOWERCASE.length)];
    }

    // Uppercase characters
    for (let i = 0; i < upperLength; i++) {
      result += UPPERCASE[crypto.randomInt(0, UPPERCASE.length)];
    }

    // Numbers
    for (let i = 0; i < numberCount; i++) {
      result += NUMBERS[crypto.randomInt(0, NUMBERS.length)];
    }

    // Symbols
    let special = SPECIAL_CHARACTERS + (urlUnsafeEnabled ? UNSAFE_SPECIAL_CHARACTERS : "");
    for (let i = 0; i < symbolCount; i++) {
      result += special[crypto.randomInt(0, special.length)];
    }

    // Shuffle the result
    result = shuffle(result);
  }

  return result;
}
