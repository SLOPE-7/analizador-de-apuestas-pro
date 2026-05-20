'use client'

import { useMemo, useState } from 'react'

import PickCard from '@/components/PickCard'

import { buildProjection } from '@/engine/projectionEngine'
import { generatePicks } from '@/engine/bettingEngine'

export default function DashboardPage() {
  const [local, setLocal] = useState([])
  const [visitante, setVisitante] = useState([])

  const projection = useMemo(() => {
    return buildProjection(local, visitante)
  }, [local, visitante])

  const picks = useMemo(() => {
    return generatePicks({
      expectedGoals: projection.expectedGoals,
      expectedCorners: projection.expectedCorners,
      overOdd: 1.85,
      cornersOdd: 1.90
    })
  }, [projection])

  return (
    <main className='min-h-screen bg-black text-white p-6'>
      <div className='max-w-7xl mx-auto'>
        <h1 className='text-4xl font-bold'>
          Analizador IA
        </h1>

        <div className='grid gap-4 mt-8'>
          {picks.map((pick, index) => (
            <PickCard
              key={index}
              {...pick}
            />
          ))}
        </div>
      </div>
    </main>
  )
}