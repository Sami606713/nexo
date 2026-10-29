import { Center, Loader } from "@mantine/core";

/** Shown instantly while a site page loads (first visits compile in dev). */
export default function SiteLoading() {
  return (
    <Center mih="60vh">
      <Loader type="dots" color="indigo" />
    </Center>
  );
}
