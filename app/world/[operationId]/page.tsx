import { WorldExperience } from "@/components/world-experience";

type PageProps = { params: Promise<{ operationId: string }> };

export default async function WorldPage({ params }: PageProps) {
  const { operationId } = await params;
  return <WorldExperience operationId={operationId} />;
}
