'use client'

type Props = {
  label: string
  probability: number
  odd: number
  edge: number
}

export default function PickCard({
  label,
  probability,
  odd,
  edge
}: Props) {
  return (
    <div className='rounded-2xl border border-white/10 bg-zinc-900 p-4'>
      <h3 className='text-lg font-bold'>
        {label}
      </h3>

      <div className='mt-3 grid grid-cols-3 gap-2'>
        <div>
          <p className='text-zinc-400 text-sm'>Prob.</p>
          <p>{probability}%</p>
        </div>

        <div>
          <p className='text-zinc-400 text-sm'>Cuota</p>
          <p>{odd}</p>
        </div>

        <div>
          <p className='text-zinc-400 text-sm'>Edge</p>
          <p>{edge.toFixed(1)}%</p>
        </div>
      </div>
    </div>
  )
}