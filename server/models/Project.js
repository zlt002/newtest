// Project model
// Represents a project in the workspace

export class Project {
  constructor(id, name, path, createdAt = null) {
    this.id = id;
    this.name = name;
    this.path = path;
    this.createdAt = createdAt || new Date().toISOString();
  }

  static fromDirectoryPath(path, name = null) {
    const pathParts = path.split(/[/\\]/);
    const dirName = name || pathParts[pathParts.length - 1] || path;
    return new Project(
      Project.generateId(path),
      dirName,
      path
    );
  }

  static generateId(path) {
    // Create a stable ID from the path
    return Buffer.from(path).toString('base64').slice(0, 16);
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      path: this.path,
      createdAt: this.createdAt,
    };
  }
}
