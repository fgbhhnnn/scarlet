import { useModelPreferences, type ModelChoice } from "../../stores/modelPicker";
import { AGENT_LABEL } from "../../stores/hosts";
import { Icon } from "../ui/primitives";

export function FavoriteButton({ choice }: { choice: ModelChoice }) {
  const favorite = useModelPreferences((s) => s.favorites.includes(choice.key));
  const toggle = useModelPreferences((s) => s.toggleFavorite);
  const label = `收藏 ${AGENT_LABEL[choice.agent]} · ${choice.label}`;
  return (
    <button type="button" aria-pressed={favorite} aria-label={label}
      title={favorite ? "取消收藏" : "添加到收藏"}
      className={`inline-flex size-8 shrink-0 items-center justify-center rounded hover:bg-raised hover:text-fg ${favorite ? "text-fg [&_svg]:fill-current" : "text-dim"}`}
      onClick={() => toggle(choice.key)}>
      <Icon name="star" size={14} />
    </button>
  );
}
