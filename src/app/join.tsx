import { Redirect, useLocalSearchParams } from 'expo-router';

/** stashcall://join?code=ABCD2345 from an invite: open Family sharing with the code filled in. */
export default function Join() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  return <Redirect href={{ pathname: '/household', params: code ? { code } : {} }} />;
}
