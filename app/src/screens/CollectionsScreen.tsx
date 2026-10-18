import { useState } from "react";
import type { CollectionMeta } from "../lib/types";
import { plural, projectCount, sortCollections } from "../lib/collections";
import { TabBar } from "../components/TabBar";
import { IconArchiveBox, IconHeart, IconPlus } from "../components/icons";

interface Props {
  collections: CollectionMeta[];
  onCreate: () => void;
  onOpen: (collectionId: string) => void;
}

type CollectionsTab = "collections" | "clips";

/**
 * Tela 5 do design 03B — "Meus projetos - Coleções".
 * Abas Coleções/Clipes, card tracejado de criação e cards de coleção
 * (ícone + nome + contagem real de projetos).
 */
export function CollectionsScreen({ collections, onCreate, onOpen }: Props) {
  const [tab, setTab] = useState<CollectionsTab>("collections");

  const tabs = [
    { id: "collections", label: `Coleções (${collections.length})` },
    { id: "clips", label: "Clipes (0)" },
  ];

  return (
    <div className="lib">
      <TabBar
        tabs={tabs}
        active={tab}
        onSelect={(id) => setTab(id as CollectionsTab)}
      />

      {tab === "clips" ? (
        <div className="lib__empty">
          <p className="lib__empty-title">Nenhum clipe ainda</p>
          <p className="lib__empty-text">
            Clipes são gerados a partir dos vídeos dos seus projetos.
          </p>
        </div>
      ) : (
        <div className="card-grid card-grid--rows">
          <button
            type="button"
            className="new-card new-card--collection"
            onClick={onCreate}
            data-testid="new-collection-card"
          >
            <IconPlus size={11} />
            <span className="new-card__label">Adicionar nova coleção</span>
          </button>
          {sortCollections(collections).map((c) => (
            <button
              type="button"
              className="ccard"
              key={c.id}
              data-testid="collection-card"
              onClick={() => onOpen(c.id)}
              title={c.name}
            >
              <span className="ccard__icon">
                {c.icon === "heart" ? <IconHeart size={16} /> : <IconArchiveBox size={22} />}
              </span>
              <span className="ccard__text">
                <span className="ccard__name">{c.name}</span>
                <span className="ccard__count">
                  {plural(projectCount(c), "projeto", "projetos")}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
