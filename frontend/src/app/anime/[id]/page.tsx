import { AnimeDetailPage } from "@/components/anime-detail";
export default function AnimePage({ params }: { params: { id: string } }) {
  return <AnimeDetailPage id={Number(params.id)} />;
}
