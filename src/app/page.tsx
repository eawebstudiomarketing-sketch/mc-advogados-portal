import Image from "next/image";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-navy px-6">
      <div className="flex w-full max-w-sm flex-col items-center text-center">
        <div className="overflow-hidden rounded-full">
          <Image
            src="/brand/logo_mc.jpg"
            alt="MC Advogados"
            width={96}
            height={96}
            priority
          />
        </div>

        <h1 className="mt-8 text-2xl font-semibold tracking-tight text-navy-foreground">
          MC Advogados Portal
        </h1>

        <div className="mt-3 h-px w-12 bg-gold" />

        <p className="mt-4 text-sm text-navy-foreground/70">
          Portal de clientes em construção.
        </p>
      </div>
    </div>
  );
}
