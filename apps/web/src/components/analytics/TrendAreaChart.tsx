"use client";

/**
 * Area chart built on recharts directly. Mantine's <AreaChart> wraps each <Area> in a Fragment, which
 * recharts 2.x (bundling react-is@18) can't see under React 19 — the chart renders empty. Styling mirrors
 * Mantine charts and follows the color scheme via CSS variables.
 */
import { useId } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Paper, Text, useMantineTheme, getThemeColor } from "@mantine/core";

export interface TrendSeries {
  name: string;
  label: string;
  color: string; // Mantine color, e.g. "indigo.5"
}

export function TrendAreaChart({
  data,
  dataKey,
  series,
  h = 280,
  valueFormatter = (v) => v.toLocaleString(),
  tickFormatter = (v) => String(v),
}: {
  data: Record<string, unknown>[];
  dataKey: string;
  series: TrendSeries[];
  h?: number;
  valueFormatter?: (v: number) => string;
  tickFormatter?: (v: number) => string;
}) {
  const theme = useMantineTheme();
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  return (
    <div style={{ height: h, width: "100%" }}>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            {series.map((s) => {
              const c = getThemeColor(s.color, theme);
              return (
                <linearGradient key={s.name} id={`${uid}-${s.name}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={c} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={c} stopOpacity={0.02} />
                </linearGradient>
              );
            })}
          </defs>
          <CartesianGrid vertical={false} stroke="var(--mantine-color-default-border)" strokeDasharray="5 5" />
          <XAxis
            dataKey={dataKey}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 12, fill: "var(--mantine-color-dimmed)" }}
            minTickGap={24}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={48}
            tick={{ fontSize: 12, fill: "var(--mantine-color-dimmed)" }}
            tickFormatter={tickFormatter}
          />
          <Tooltip
            cursor={{ stroke: "var(--mantine-color-default-border)" }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <Paper withBorder shadow="md" radius="md" p="xs">
                  <Text size="xs" fw={600} mb={4}>
                    {String(label)}
                  </Text>
                  {payload.map((p) => {
                    const s = series.find((x) => x.name === p.dataKey);
                    return (
                      <Text key={String(p.dataKey)} size="xs">
                        <span
                          style={{
                            display: "inline-block",
                            width: 8,
                            height: 8,
                            borderRadius: 4,
                            marginRight: 6,
                            background: s ? getThemeColor(s.color, theme) : undefined,
                          }}
                        />
                        {s?.label ?? String(p.dataKey)}: <b>{valueFormatter(Number(p.value ?? 0))}</b>
                      </Text>
                    );
                  })}
                </Paper>
              ) : null
            }
          />
          {series.map((s) => (
            <Area
              key={s.name}
              type="monotone"
              dataKey={s.name}
              name={s.label}
              stroke={getThemeColor(s.color, theme)}
              strokeWidth={2}
              fill={`url(#${uid}-${s.name})`}
              dot={false}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
