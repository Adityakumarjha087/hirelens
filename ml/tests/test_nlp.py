from __future__ import annotations

from datetime import date

from app.nlp.ner import RuleBasedNER, build_ner, guess_location, guess_name
from app.nlp.sections import parse_education, parse_experience, split_sections, total_experience_years
from app.nlp.skills import extract_skills, extract_skills_from_list, normalize_skill, normalize_skills


def test_extract_skills_respects_boundaries() -> None:
    skills = extract_skills("Built SPAs in JavaScript and ReactJS, APIs in Node.js; no Java here. Used k8s.")
    assert "JavaScript" in skills and "React" in skills and "Node.js" in skills and "Kubernetes" in skills
    assert extract_skills("We use JavaScript only") == ["JavaScript"]


def test_symbols_in_skills() -> None:
    assert set(extract_skills("C++ and C# developers, CI/CD with GitHub Actions")) >= {
        "C++",
        "C#",
        "CI/CD",
        "GitHub Actions",
    }


def test_normalize_skill_aliases_and_unknowns() -> None:
    assert normalize_skill("postgres") == "PostgreSQL"
    assert normalize_skill("  golang ") == "Go"
    assert normalize_skill("quantum widgets") == "Quantum Widgets"
    assert normalize_skill("") == ""
    assert normalize_skills(["React", "reactjs", "AWS", "aws"]) == ["React", "AWS"]


def test_extract_from_list_allows_ambiguous_aliases() -> None:
    assert extract_skills_from_list("Go, Terraform and R language") == ["Go", "Terraform", "R"]
    assert extract_skills_from_list("Just a sentence about go") == []


def test_split_sections_and_header(resume_text: str) -> None:
    sections = split_sections(resume_text)
    assert sections.header[0] == "Priya Sharma"
    assert {"summary", "skills", "experience", "education", "projects"} <= set(sections.blocks)


def test_parse_experience_and_years() -> None:
    lines = [
        "Staff Engineer at Acme Corp | Jan 2020 - Present",
        "- Led platform team",
        "Engineer — Beta | 2015 – 2019",
        "Contractor, Gamma (06/2018 - 12/2019)",
    ]
    items = parse_experience(lines, today=date(2025, 1, 1))
    assert [i.company for i in items] == ["Acme Corp", "Beta", "Gamma"]
    assert items[0].end == "Present" and items[0].duration_months == 60
    assert items[0].highlights == ["Led platform team"]
    # Overlapping 2018-2019 contract is not double counted: 2015-01..2019-12 + 2020-01..2025-01
    assert total_experience_years(items, "", today=date(2025, 1, 1)) == 10.0


def test_years_claim_fallback() -> None:
    assert total_experience_years([], "Engineer with 4+ years of experience") == 4.0
    assert total_experience_years([], "No dates here") == 0.0


def test_company_on_next_line() -> None:
    items = parse_experience(
        ["Data Analyst (2019 - 2021)", "Contoso Ltd", "- Built dashboards"], today=date(2024, 1, 1)
    )
    assert items[0].title == "Data Analyst" and items[0].company == "Contoso Ltd"


def test_parse_education() -> None:
    items = parse_education(
        ["Master of Science in Data Science, Stanford University, 2020", "MBA", "Harvard Business School"]
    )
    assert items[0].institution == "Stanford University" and items[0].year == "2020"
    assert "Data Science" in items[0].field
    assert items[1].degree == "MBA" and items[1].institution == "Harvard Business School"


def test_rule_ner(resume_text: str) -> None:
    ents = RuleBasedNER().extract(resume_text)
    labels = {(e.label, e.text) for e in ents}
    assert ("PERSON", "Priya Sharma") in labels
    assert ("EMAIL", "priya.sharma@example.com") in labels
    assert any(lbl == "PHONE" for lbl, _ in labels)
    assert any(lbl == "GPE" and "San Francisco" in t for lbl, t in labels)
    assert any(lbl == "ORG" and "Stripe Inc" in t for lbl, t in labels)


def test_guessers() -> None:
    assert guess_name("RESUME\njohn@x.com\nJohn Q. Public\n") == "John Q. Public"
    assert guess_name("12345\n") == ""
    assert guess_location("Based in Remote") == "Remote"
    assert guess_location("nowhere") is None


def test_build_ner_falls_back_to_rules() -> None:
    assert build_ner("auto", "definitely_missing_model").name in {"rule", "spacy"}
    assert build_ner("rule", "x").name == "rule"
