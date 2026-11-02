export class Id {
  static random() {
    return Math.random().toString(36).substring(2)
  }
}
