import { PageHeader } from '../components/ui';

export default function About() {
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="About SATLab" />
      <p className="text-lg leading-8 text-slate-700">SATLab is a student-focused SAT practice platform built to make preparation clearer, more accessible, and more personalized.</p>
      <section className="card mt-6">
        <h2 className="text-xl font-semibold">Founder</h2>
        <dl className="mt-3 space-y-2 text-base">
          <div className="flex gap-3"><dt className="w-24 shrink-0 text-slate-500">Name</dt><dd>Nguyen Dinh Quyet Thang (Ray)</dd></div>
          <div className="flex gap-3"><dt className="w-24 shrink-0 text-slate-500">Location</dt><dd>Vietnam</dd></div>
          <div className="flex gap-3"><dt className="w-24 shrink-0 text-slate-500">Email</dt><dd><a className="text-brand-700 underline" href="mailto:nguyendinhquyetthang100@gmail.com">nguyendinhquyetthang100@gmail.com</a></dd></div>
        </dl>
      </section>
      <section className="card mt-6">
        <h2 className="text-xl font-semibold">Questions</h2>
        <p className="mt-2 text-base leading-7 text-slate-700">Some practice questions come from the open OpenSAT project (github.com/Anas099X/OpenSAT). Imported questions appear only after a person has reviewed them. SATLab has not independently verified their copyright status or accuracy, and they are not official College Board questions.</p>
      </section>
    </div>
  );
}
