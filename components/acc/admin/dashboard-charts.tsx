"use client"

import { Bar, BarChart, CartesianGrid, XAxis, YAxis, Cell } from "recharts"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"

export function CategoryDistributionChart({
  data,
}: {
  data: { bucket: string; players: number; fill: string }[]
}) {
  const config: ChartConfig = { players: { label: "Players" } }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Player category distribution</CardTitle>
        <CardDescription>Approved & registered players by academic bucket</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={config} className="h-[240px] w-full">
          <BarChart data={data} margin={{ left: -16, top: 8 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="bucket" tickLine={false} axisLine={false} tickMargin={8} />
            <YAxis tickLine={false} axisLine={false} width={32} allowDecimals={false} />
            <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
            <Bar dataKey="players" radius={[6, 6, 0, 0]}>
              {data.map((d) => (
                <Cell key={d.bucket} fill={d.fill} />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

export function FranchiseSpendChart({
  data,
}: {
  data: { name: string; spent: number; fill: string }[]
}) {
  const config: ChartConfig = { spent: { label: "Spent (₹)" } }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Franchise spending</CardTitle>
        <CardDescription>Credits committed at auction per franchise</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={config} className="h-[240px] w-full">
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
            <CartesianGrid horizontal={false} strokeDasharray="3 3" />
            <XAxis type="number" tickLine={false} axisLine={false} hide />
            <YAxis
              type="category"
              dataKey="name"
              tickLine={false}
              axisLine={false}
              width={44}
              tickMargin={6}
            />
            <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
            <Bar dataKey="spent" radius={[0, 6, 6, 0]}>
              {data.map((d) => (
                <Cell key={d.name} fill={d.fill} />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
