import { Center, Loader } from "@mantine/core";

export default function AuthLoading() {
  return (
    <Center mih="100dvh">
      <Loader type="dots" color="indigo" />
    </Center>
  );
}
