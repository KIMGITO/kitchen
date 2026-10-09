/** Shared password policy for every sign-up form. bcrypt (used by Supabase Auth) ignores everything past 72 bytes. */
const COMMON = new Set(['password', 'password1', 'password12', 'password123', 'qwerty123', 'qwertyuiop', '12345678', '123456789', '1234567890', 'iloveyou1', 'welcome123', 'admin1234', 'letmein123', 'abc12345']);

export const PASSWORD_HINT = 'At least 8 characters, with a letter and a number.';

export function checkPassword(password: string, confirm?: string, email?: string): string | null {
  if (password.length < 8) return 'Password must be at least 8 characters.';
  if (new TextEncoder().encode(password).length > 72) return 'Password is too long (72 characters at most).';
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'Password needs at least one letter and one number.';
  if (COMMON.has(password.toLowerCase())) return 'That password is too common. Choose a less guessable one.';
  const local = email?.split('@')[0]?.toLowerCase();
  if (local && local.length >= 4 && password.toLowerCase().includes(local)) return 'Password should not contain your email name.';
  if (confirm !== undefined && password !== confirm) return 'Passwords do not match.';
  return null;
}
