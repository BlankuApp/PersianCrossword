import { Check } from 'lucide-react';

interface StepDef<T extends string> {
  id: T;
  label: string;
}

interface Props<T extends string> {
  steps: StepDef<T>[];
  current: T;
  order: T[];
}

export default function StepIndicator<T extends string>({ steps, current, order }: Props<T>) {
  const currentIndex = order.indexOf(current);

  return (
    <nav className="step-indicator" aria-label="مراحل">
      {steps.map((step, i) => {
        const done = i < currentIndex;
        const active = i === currentIndex;
        return (
          <div key={step.id} className="step-item">
            <div
              className={
                'step-circle' +
                (done ? ' done' : '') +
                (active ? ' active' : '')
              }
            >
              {done ? <Check size={14} strokeWidth={3} /> : <span>{i + 1}</span>}
            </div>
            <span
              className={
                'step-label' +
                (active ? ' active' : '') +
                (done ? ' done' : '')
              }
            >
              {step.label}
            </span>
            {i < steps.length - 1 && (
              <div className={'step-connector' + (done ? ' done' : '')} />
            )}
          </div>
        );
      })}
    </nav>
  );
}
