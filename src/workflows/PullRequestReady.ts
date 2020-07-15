import { IWorkflowBaseParams, WorkflowBase } from './WorkflowBase';

interface IPullRequestReadyParams extends IWorkflowBaseParams {
  destinationList: string;
}

export class PullRequestReady extends WorkflowBase {
  public destinationList: string;

  public constructor(params: IPullRequestReadyParams) {
    super(params);

    this.destinationList = params.destinationList;
  }

  public async execute(): Promise<string> {
    if (!this.payload.pull_request) {
      throw new Error(`There were no pull_request details with payload: ${JSON.stringify(this.payload)}`);
    }

    const board = await this.getBoard(this.trelloBoardName);
    const list = this.getList(board, this.destinationList);

    const branchName = this.payload.pull_request.head.ref.trim().replace(/\W+/g, '-').toLowerCase();
    const cardNumberMatches = /\d+/g.exec(branchName);
    let cardNumber;
    if (cardNumberMatches && cardNumberMatches.length) {
      [cardNumber] = cardNumberMatches;
    }

    if (!cardNumber) {
      console.log(JSON.stringify(this.payload));
      return `PullRequestReady: Could not find card number in branch name\n${JSON.stringify(this.payload)}`;
    }

    let result = `Starting PullRequestReady workflow\n-----------------`;
    result += `\nFound card number (${cardNumber}) in branch: ${branchName}`;

    const card = await this.getCard({
      boardId: board.id,
      cardNumber,
    });

    // Update issue with card link and apply labels
    let body = this.payload.pull_request.body || '';
    if (!body.includes(card.shortUrl)) {
      if (body) {
        body += '\n\n';
      }

      body += card.shortUrl;
      result += `\nAdding card shortUrl to PR body`;
    }

    const labels = new Set<string>();
    for (const label of this.payload.pull_request.labels || []) {
      labels.add(label.name);
    }

    try {
      if (card.labels.length) {
        result += `\nGetting labels for repository... `;
        const githubRepoLabels = await this.github.issues.listLabelsForRepo({
          owner: this.repo.owner,
          repo: this.repo.repo,
        });
        result += 'Done!';

        for (const label of card.labels) {
          const labelName = label.name.toLowerCase();
          for (const githubLabel of githubRepoLabels.data) {
            if (labelName === githubLabel.name.toLowerCase()) {
              result += `\nAdding label: ${githubLabel.name}`;
              labels.add(githubLabel.name);
              break;
            }
          }
        }
      }
    } catch (ex) {
      // Not critical if assigning labels fails
      result += `\n${ex.stack}`;
      console.error(ex);
    }

    try {
      result += `\nUpdating PR with card url and labels... `;
      await this.github.issues.update({
        owner: this.repo.owner,
        repo: this.repo.repo,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        issue_number: this.payload.pull_request.number,
        body,
        labels: Array.from(labels),
      });
      result += 'Done!';
    } catch (ex) {
      // Not critical if updating github PR fails
      result += `\n${ex.stack}`;
      console.error(ex);
    }

    let comment: string | undefined;
    if (this.payload.sender) {
      comment = `Pull request ${this.payload.action || 'opened'} by [${this.payload.sender.login}](${this.payload.sender.html_url})`;
    } else {
      comment = `Pull request ${this.payload.action || 'opened'}!`;
    }

    if (this.payload.pull_request.html_url) {
      comment += ` - ${this.payload.pull_request.html_url}`;
    }

    const moveCardResult = await this.moveCard({
      card,
      list,
      comment,
    });

    result += `\n${moveCardResult}`;
    return result;
  }
}
