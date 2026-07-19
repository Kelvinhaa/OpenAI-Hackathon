import MapWorkspace from "./MapWorkspace";

export default async function LearningMapPage({
  params,
}: {
  params: Promise<{ studyId: string }>;
}) {
  const { studyId } = await params;

  return <MapWorkspace studyId={studyId} />;
}
