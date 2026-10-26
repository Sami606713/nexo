"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { Badge, Chip, Group, SimpleGrid, Skeleton, Stack, Switch, Text, TextInput, UnstyledButton } from "@mantine/core";
import { modals } from "@mantine/modals";
import { IconSearch } from "@tabler/icons-react";
import { useStudio } from "../context";
import { orientationOf, resizeScene } from "../scene";
import { useEditorState, useStore } from "../store";
import { TEMPLATES, TEMPLATE_CATEGORIES, instantiateTemplate, templateOrientation, type StudioTemplate } from "../templates";
import { PanelTitle } from "./common";

const ScenePreview = dynamic(() => import("../canvas/ScenePreview"), { ssr: false, loading: () => <Skeleton h={120} /> });

export function TemplatesPanel() {
  const store = useStore();
  const st = useEditorState();
  const { brand } = useStudio();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("all");
  const [allFormats, setAllFormats] = useState(false);
  const [brandColors, setBrandColors] = useState(brand.colors.length > 0);
  const orient = orientationOf(st.scene.width, st.scene.height);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return TEMPLATES.filter((t) => (allFormats || templateOrientation(t) === orient) && (cat === "all" || t.category === cat))
      .filter((t) => !s || t.name.toLowerCase().includes(s) || t.tags.some((x) => x.includes(s)) || t.category.includes(s));
  }, [q, cat, allFormats, orient]);

  const previews = useMemo(
    () => new Map(list.map((t) => [t.id, brandColors ? instantiateTemplate(t, brand.colors) : t.scene])),
    [list, brandColors, brand.colors],
  );

  const apply = (t: StudioTemplate) => {
    const run = () => {
      let scene = instantiateTemplate(t, brandColors ? brand.colors : null);
      if (scene.width !== st.scene.width || scene.height !== st.scene.height) scene = resizeScene(scene, st.scene.width, st.scene.height);
      store.commit(() => scene);
      store.select([]);
    };
    if (st.scene.layers.length === 0) return run();
    modals.openConfirmModal({
      title: "Replace your design?",
      children: <Text size="sm">Applying “{t.name}” replaces everything on the page. You can undo with Ctrl+Z.</Text>,
      labels: { confirm: "Replace", cancel: "Cancel" },
      onConfirm: run,
    });
  };

  return (
    <Stack gap="sm">
      <PanelTitle title="Templates" hint="Original layouts — every element stays editable." />
      <TextInput size="sm" placeholder="Search templates" leftSection={<IconSearch size={15} />} value={q} onChange={(e) => setQ(e.currentTarget.value)} />
      <Chip.Group value={cat} onChange={(v) => setCat(v as string)}>
        <Group gap={6}>
          <Chip size="xs" value="all">
            All
          </Chip>
          {TEMPLATE_CATEGORIES.map((c) => (
            <Chip key={c.value} size="xs" value={c.value}>
              {c.label}
            </Chip>
          ))}
        </Group>
      </Chip.Group>
      <Group justify="space-between">
        <Switch size="xs" label="All formats" checked={allFormats} onChange={(e) => setAllFormats(e.currentTarget.checked)} />
        <Switch
          size="xs"
          label="Use brand colors"
          checked={brandColors}
          disabled={!brand.colors.length}
          onChange={(e) => setBrandColors(e.currentTarget.checked)}
        />
      </Group>
      {list.length === 0 && (
        <Text size="sm" c="dimmed" ta="center" py="lg">
          No templates for this format yet — try “All formats”.
        </Text>
      )}
      <SimpleGrid cols={2} spacing="sm">
        {list.map((t) => (
          <UnstyledButton key={t.id} onClick={() => apply(t)} className="studio-tile" aria-label={`Use template ${t.name}`}>
            <div style={{ borderRadius: 10, overflow: "hidden", boxShadow: "0 0 0 1px var(--mantine-color-default-border)" }}>
              <ScenePreview scene={previews.get(t.id) ?? t.scene} width={136} />
            </div>
            <Text size="xs" fw={600} mt={4} truncate>
              {t.name}
            </Text>
            {allFormats && templateOrientation(t) !== orient && (
              <Badge size="xs" variant="light" color="gray">
                resizes to fit
              </Badge>
            )}
          </UnstyledButton>
        ))}
      </SimpleGrid>
    </Stack>
  );
}
