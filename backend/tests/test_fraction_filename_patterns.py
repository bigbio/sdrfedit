"""Contract tests for fraction / tech filename patterns used by the wizard.

Mirrors `parseFractionTechFromName` in src/app/core/models/wizard.ts so PXD-style
names (pH / Fr / FT) keep working if the TS regex regresses — keep both in sync.
"""

from __future__ import annotations

import re


def parse_fraction_tech_from_name(file_name: str) -> tuple[int, int]:
    base = re.sub(r"\.[^.]+$", "", file_name)
    fraction_match = (
        re.search(r"(?:^|[_\-.])(?:fraction|slice)(\d+)", base, re.I)
        or re.search(r"(?:^|[_\-.])Fr(\d+)(?:_|\.|$)", base, re.I)
        or re.search(r"(?:^|[_\-.])FT(\d+)(?:_|\.|$)", base, re.I)
        or re.search(r"_F(\d+)(?:_|\.|$)", base)
        or re.search(r"(?:^|[_\-.])f(\d+)(?:_|\.|$)", base, re.I)
        or re.search(r"(?:^|[_\-.])pH(\d+)(?:_|\.|$)", base, re.I)
    )
    tech_match = (
        re.search(r"(?:^|[_\-.])(?:tech|technical)[_-]?(\d+)", base, re.I)
        or re.search(r"(?:^|[_\-.])(?:r|replicate)(\d+)(?:_|\.|$)", base, re.I)
        or re.search(r"_R(\d+)(?:_|\.|$)", base)
    )
    fraction_id = int(fraction_match.group(1)) if fraction_match else 1
    tech = int(tech_match.group(1)) if tech_match else 1
    return fraction_id, tech


def test_parses_ph_fraction_tags():
    assert parse_fraction_tech_from_name(
        "20111219_EXQ5_KiSH_SA_LabelFree_HeLa_Proteome_Control_rep1_pH11.raw"
    ) == (11, 1)


def test_parses_fr_and_ft_tags():
    assert parse_fraction_tech_from_name("sample_Phospho_Control_rep1_Fr6.raw") == (6, 1)
    assert parse_fraction_tech_from_name("sample_Phospho_Control_rep1_FT2.raw") == (2, 1)


def test_parses_classic_f_and_tech_tags():
    assert parse_fraction_tech_from_name("Run_1_F3_r2.raw") == (3, 2)
    assert parse_fraction_tech_from_name("sample_fraction4_tech2.raw") == (4, 2)


def test_biological_rep_in_name_is_not_tech():
    # Bare "rep1" is biological; tech stays 1.
    assert parse_fraction_tech_from_name("HeLa_Control_rep1_pH3.raw") == (3, 1)
