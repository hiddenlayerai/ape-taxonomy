# HiddenLayer APE Taxonomy

The HiddenLayer Adversarial Prompt Engineering, or APE, Taxonomy is a structured framework for describing attacks against generative AI systems that are carried out through prompts, prompt sequences, retrieved content, tool inputs, or other natural language instructions.

“Prompt injection” has become a common phrase for many different attacks against large language models and other generative AI systems. The APE Taxonomy gives security teams, researchers, red teams, and detection engineers a more precise language for describing how these attacks work, what adversaries are trying to accomplish, and what kind of security impact may result.

## Taxonomy Structure

The taxonomy separates observable prompt behavior from inferred adversarial outcomes and security impact.

The prompt-behavior side of the taxonomy is organized around tactics, techniques, and prompts:

- **Tactics** group techniques by the mechanism they exploit.
- **Techniques** describe repeatable prompt-level methods.
- **Prompts** are concrete examples or procedures that demonstrate those techniques.

The objective side of the taxonomy is organized around impacts, objectives, and objective subtypes:

- **Impacts** describe the broader security consequence using the confidentiality, integrity, and availability model.
- **Objectives** describe specific adversarial outcomes against AI systems.
- **Objective subtypes** provide more granular categories where an objective needs additional structure.

This structure is meant to avoid collapsing method, outcome, and impact into the same label. The same technique can support different objectives, and the same objective can be pursued through different techniques. Separating these layers makes the taxonomy more useful for red teaming, threat modeling, detection engineering, reporting, and risk analysis.

## Website

The interactive taxonomy website provides several ways to explore the framework:

- **Graph view** for exploring relationships between tactics and techniques.
- **Matrix view** for browsing tactics and techniques in a security-framework-style layout.
- **Objectives view** for exploring impacts, objectives, and objective subtypes.
- **Highlighted examples** that show which parts of a prompt correspond to a technique.
- **Contribution form** for submitting suggested additions, corrections, examples, references, and other improvements.

Explore the taxonomy here:

[https://ape.hiddenlayer.com](https://ape.hiddenlayer.com)

## Contributing

The APE Taxonomy is intended to be a community resource for the AI security field. Contributions are welcome, including new techniques, refined descriptions, additional examples, corrections, references, and feedback on taxonomy structure.

The preferred way to contribute is through the [contribution form](https://ape.hiddenlayer.com/contribute.html) on the taxonomy website. 

## License

<a href="https://ape.hiddenlayer.com">APE Taxonomy</a> © 2026 by <a href="https://hiddenlayer.com">HiddenLayer</a> is licensed under <a href="https://creativecommons.org/licenses/by-nd/4.0/">CC BY-ND 4.0</a><img src="https://mirrors.creativecommons.org/presskit/icons/cc.svg" style="max-width: 1em;max-height:1em;margin-left:.2em;"><img src="https://mirrors.creativecommons.org/presskit/icons/by.svg" style="max-width: 1em;max-height:1em;margin-left:.2em;"><img src="https://mirrors.creativecommons.org/presskit/icons/nd.svg" style="max-width:1em;max-height:1em;margin-left:.2em;">